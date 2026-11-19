import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { go } from "../shared/goBuilder";
import type { BuildContext } from "../../context/build";
import { nullShardDependency, undefinedShardDependency } from "../../sharedDependency/defaults";
import { jsNumberToStringDependency } from "../duplojs/string/to/sharedDependency";

/**
 * Valeurs JavaScript lues sans connaître leur type à la compilation (D-19).
 *
 * ```go
 * func JSElementAt[T any](values []T, index float64) any        // tableau[i] : T ou JSUndefined
 * func JSMapGet[K comparable, V any](values map[K]V, key K) any // record[k]  : V ou JSUndefined
 * func JSIsNullish(value any) bool                              // value == null || value === undefined
 * func JSTypeOf(value any) string                               // typeof value
 * func JSToString(value any) string                             // String(value), `${value}`
 * ```
 * Ces helpers ne servent que quand le type Go est `any` ; quand TypeScript
 * connaît le type, le transformer produit directement le Go du bon type.
 */

export const javascriptValueIdentifiers = {
	elementAt: GoAST.createIdentifier("JSElementAt"),
	mapGet: GoAST.createIdentifier("JSMapGet"),
	isNullish: GoAST.createIdentifier("JSIsNullish"),
	typeOf: GoAST.createIdentifier("JSTypeOf"),
	toString: GoAST.createIdentifier("JSToString"),
} as const;

const { any, bool, comparable, float64, int, string } = go.types;
const undefinedValue = go.empty("JSUndefined");
const nullValue = go.empty("JSNull");

/** Un indice JS valide : entier, positif, dans le tableau. Sinon `undefined`. */
function elementAtFunction() {
	const position = go.id("position");
	const values = go.id("values");

	return go.function({
		name: "JSElementAt",
		generic: [["T", any]],
		parameters: [
			go.parameter("values", GoAST.createSliceType({ elementType: go.id("T") })),
			go.parameter("index", float64),
		],
		returns: any,
		body: [
			go.declare("position", go.convert(int, go.id("index"))),
			go.when(
				go.binary(
					go.binary(
						go.binary(go.convert(float64, position), "!=", go.id("index")),
						"||",
						go.binary(position, "<", go.int(0)),
					),
					"||",
					go.binary(position, ">=", go.call("len", [values])),
				),
				[go.return(undefinedValue)],
			),
			go.return(go.index(values, position)),
		],
	});
}

function mapGetFunction() {
	return go.function({
		name: "JSMapGet",
		generic: [["K", comparable], ["V", any]],
		parameters: [
			go.parameter("values", GoAST.createMapType({
				keyType: go.id("K"),
				valueType: go.id("V"),
			})),
			go.parameter("key", go.id("K")),
		],
		returns: any,
		body: [
			go.variable("value", go.id("V")),
			go.variable("found", bool),
			go.assign([go.id("value"), go.id("found")], [go.index(go.id("values"), go.id("key"))]),
			go.when(go.not(go.id("found")), [go.return(undefinedValue)]),
			go.return(go.id("value")),
		],
	});
}

function isNullishFunction() {
	return go.function({
		name: "JSIsNullish",
		parameters: [go.parameter("value", any)],
		returns: bool,
		body: [
			go.return(go.binary(
				go.binary(go.id("value"), "==", nullValue),
				"||",
				go.binary(go.id("value"), "==", undefinedValue),
			)),
		],
	});
}

function typeCase(type: GoAST.TypeReference, statements: readonly GoAST.Statement[]) {
	return GoAST.createTypeSwitchCase({
		types: DCommon.cast([type]),
		statements,
	});
}

/**
 * ```go
 * func JSTypeOf(value any) string {
 *     switch value.(type) {
 *     case string: return "string"
 *     case float64: return "number"
 *     case bool: return "boolean"
 *     case JSUndefined: return "undefined"
 *     }
 *     if value != nil && reflect.ValueOf(value).Kind() == reflect.Func { return "function" }
 *     return "object" // null, tableaux, objets, Either
 * }
 * ```
 */
function typeOfFunction() {
	return go.function({
		name: "JSTypeOf",
		parameters: [go.parameter("value", any)],
		returns: string,
		body: [
			GoAST.createTypeSwitchStatementWithoutDefault({
				expression: go.id("value"),
				cases: [
					typeCase(string, [go.return(go.string("string"))]),
					typeCase(float64, [go.return(go.string("number"))]),
					typeCase(bool, [go.return(go.string("boolean"))]),
					typeCase(go.id("JSUndefined"), [go.return(go.string("undefined"))]),
				],
			}),
			go.when(
				go.binary(
					go.binary(go.id("value"), "!=", GoAST.createNilLiteral({})),
					"&&",
					go.binary(
						go.call(go.select(go.call(go.select("reflect", "ValueOf"), [go.id("value")]), "Kind")),
						"==",
						go.select("reflect", "Func"),
					),
				),
				[go.return(go.string("function"))],
			),
			go.return(go.string("object")),
		],
	});
}

/**
 * `String(value)` de JavaScript.
 * ```go
 * func JSToString(value any) string {
 *     switch typed := value.(type) {
 *     case string: return typed
 *     case float64: return JSNumberToString(typed)
 *     case bool: if typed { return "true" }; return "false"
 *     case JSNull: return "null"
 *     case JSUndefined: return "undefined"
 *     }
 *     reflected := reflect.ValueOf(value)
 *     if reflected.Kind() == reflect.Slice { // [1, null, "a"] -> "1,,a"
 *         parts := make([]string, reflected.Len())
 *         for index := 0; index < reflected.Len(); index += 1 {
 *             element := reflected.Index(index).Interface()
 *             if !JSIsNullish(element) { parts[index] = JSToString(element) }
 *         }
 *         return strings.Join(parts, ",")
 *     }
 *     return "[object Object]"
 * }
 * ```
 */
function toStringFunction() {
	const typed = go.id("typed");
	const reflected = go.id("reflected");
	const index = go.id("index");
	const element = go.id("element");
	const parts = go.id("parts");
	const length = go.call(go.select(reflected, "Len"));

	return go.function({
		name: "JSToString",
		parameters: [go.parameter("value", any)],
		returns: string,
		body: [
			GoAST.createTypeSwitchStatementWithoutDefault({
				expression: go.id("value"),
				identifier: typed,
				cases: [
					typeCase(string, [go.return(typed)]),
					typeCase(float64, [go.return(go.call("JSNumberToString", [typed]))]),
					typeCase(bool, [go.when(typed, [go.return(go.string("true"))]), go.return(go.string("false"))]),
					typeCase(go.id("JSNull"), [go.return(go.string("null"))]),
					typeCase(go.id("JSUndefined"), [go.return(go.string("undefined"))]),
				],
			}),
			go.declare("reflected", go.call(go.select("reflect", "ValueOf"), [go.id("value")])),
			go.when(
				go.binary(go.call(go.select(reflected, "Kind")), "==", go.select("reflect", "Slice")),
				[
					go.declare("parts", GoAST.createCallExpression({
						callee: go.id("make"),
						typeArgument: GoAST.createSliceType({ elementType: string }),
						arguments: [length],
					})),
					GoAST.createForStatement({
						initializer: go.declare("index", go.int(0)),
						condition: go.binary(index, "<", length),
						post: GoAST.createCompoundAssignmentStatement({
							operator: "+=",
							target: index,
							value: go.int(1),
						}),
						body: go.block([
							go.declare("element", go.call(go.select(go.call(go.select(reflected, "Index"), [index]), "Interface"))),
							go.when(go.not(go.call("JSIsNullish", [element])), [go.assign([go.index(parts, index)], [go.call("JSToString", [element])])]),
						]),
					}),
					go.return(go.call(go.select("strings", "Join"), [parts, go.string(",")])),
				],
			),
			go.return(go.string("[object Object]")),
		],
	});
}

/**
 * Dépend de `JSNull`, `JSUndefined` et `JSNumberToString` : le transformer qui
 * l'enregistre enregistre aussi ces dépendances (`registerJavascriptValues`).
 */
export const javascriptValuesDependency = DCommon.memo(() => createSharedDependency({
	imports: [
		GoAST.createImportDeclaration({ path: "reflect" }),
		GoAST.createImportDeclaration({ path: "strings" }),
	],
	init: [],
	declarations: [
		elementAtFunction(),
		mapGetFunction(),
		isNullishFunction(),
		typeOfFunction(),
		toStringFunction(),
	],
}));

/** Référence `shard_dependencies.JSxxx`, avec toutes les dépendances du helper. */
export function javascriptValue(context: BuildContext, name: keyof typeof javascriptValueIdentifiers) {
	context.registerSharedDependency(nullShardDependency.value);
	context.registerSharedDependency(undefinedShardDependency.value);
	context.registerSharedDependency(jsNumberToStringDependency.value);

	return GoAST.createSelectorExpression({
		target: context.registerSharedDependency(javascriptValuesDependency.value),
		identifier: javascriptValueIdentifiers[name],
	});
}
