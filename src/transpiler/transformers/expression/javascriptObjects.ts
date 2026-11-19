import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import type { BuildContext } from "../../context/build";
import { nullShardDependency, undefinedShardDependency } from "../../sharedDependency/defaults";
import { jsStringDependency } from "../duplojs/string/core/sharedDependency";
import { go, type GoTypeNode } from "../shared/goBuilder";

/**
 * Objets dont Go ne connaît pas la forme : des valeurs `any` (D-20).
 *
 * En JS, un objet est un dictionnaire : on peut lire `raw.name` sur un `any`, et
 * renvoyer un `any` là où un `User` est attendu sans rien vérifier. En Go, un
 * `User` est un struct de forme fixe. Deux helpers font le pont, en retrouvant
 * les champs **par leur nom TS** (le tag `json:"name"` que met `tsTypeToGo`) :
 *
 * ```go
 * func JSGetProperty(value any, name string) any // raw.name : la valeur, ou undefined
 * func JSAs[T any](value any) T                  // un any utilisé comme User
 * ```
 * `JSAs` renvoie la valeur telle quelle si elle a déjà le bon type (cas courant,
 * sans copie). Sinon il recopie champ par champ, quel que soit leur ordre, et
 * convertit aussi les tableaux d'objets. Deux cas ne peuvent pas imiter JS, car
 * un struct a une forme fixe :
 * - un champ en **trop** est perdu (le struct n'a pas de case pour lui) ;
 * - un champ **absent** ou du **mauvais type** arrête le programme avec un
 *   message clair (`JSAs : valeur.age est un string, float64 attendu`). Un champ
 *   facultatif (`age?: number`, un `any` en Go) absent devient `undefined`.
 */

const reflect = (name: string) => go.select("reflect", name);
const { any, float64, string } = go.types;
const reflectValue = GoAST.createPackageTypeReference({
	packageName: go.id("reflect"),
	identifier: go.id("Value"),
});
const reflectStructField = GoAST.createPackageTypeReference({
	packageName: go.id("reflect"),
	identifier: go.id("StructField"),
});

function method(target: GoAST.Expression | string, name: string, callArguments: readonly GoAST.Expression[] = []) {
	return go.call(go.select(target, name), callArguments);
}

function kindIs(value: GoAST.Expression | string, kind: string) {
	return go.binary(method(value, "Kind"), "==", reflect(kind));
}

/** `for index := 0; index < limit; index += 1 { … }` */
function countTo(limit: GoAST.Expression, body: readonly GoAST.Statement[]) {
	return GoAST.createForStatement({
		initializer: go.declare("index", go.int(0)),
		condition: go.binary(go.id("index"), "<", limit),
		post: GoAST.createCompoundAssignmentStatement({
			operator: "+=",
			target: go.id("index"),
			value: go.int(1),
		}),
		body: go.block(body),
	});
}

/** Retire les `interface{}` qui enveloppent la valeur (`any` dans un `any`). */
function unwrapInterface(name: string) {
	return GoAST.createForStatement({
		condition: go.binary(
			go.binary(method(name, "IsValid"), "&&", kindIs(name, "Interface")),
			"&&",
			go.not(method(name, "IsNil")),
		),
		body: go.block([go.assign([go.id(name)], [method(name, "Elem")])]),
	});
}

/** Nom TS d'un champ : son tag `json`, sinon son nom Go. */
function fieldNameFunction() {
	return go.function({
		name: "jsFieldName",
		parameters: [go.parameter("field", reflectStructField)],
		returns: string,
		body: [
			go.declare("name", method(go.select("field", "Tag"), "Get", [go.string("json")])),
			go.when(go.binary(go.id("name"), "==", go.string("")), [go.return(go.select("field", "Name"))]),
			go.return(go.id("name")),
		],
	});
}

/** Champ `name` d'un struct (par tag) ou clé d'une map de chaînes ; invalide si absent. */
function lookupFunction() {
	return go.function({
		name: "jsLookup",
		parameters: [go.parameter("source", reflectValue), go.parameter("name", string)],
		returns: reflectValue,
		body: [
			unwrapInterface("source"),
			go.when(go.binary(method("source", "IsValid"), "&&", kindIs("source", "Struct")), [
				countTo(method("source", "NumField"), [
					go.when(
						go.binary(
							go.call("jsFieldName", [method(method("source", "Type"), "Field", [go.id("index")])]),
							"==",
							go.id("name"),
						),
						[go.return(method("source", "Field", [go.id("index")]))],
					),
				]),
			]),
			go.when(
				go.binary(
					go.binary(method("source", "IsValid"), "&&", kindIs("source", "Map")),
					"&&",
					go.binary(method(method(method("source", "Type"), "Key"), "Kind"), "==", reflect("String")),
				),
				[go.return(method("source", "MapIndex", [go.call(reflect("ValueOf"), [go.id("name")])]))],
			),
			go.return(GoAST.createStructLiteral({
				typeReference: reflectValue,
				elements: [],
			})),
		],
	});
}

function failure(path: GoAST.Expression, detail: GoAST.Expression) {
	return go.call("panic", [go.binary(go.binary(go.string("JSAs : "), "+", path), "+", detail)]);
}

/**
 * ```go
 * func jsConvert(source reflect.Value, target reflect.Value, path string) {
 *     for source.IsValid() && source.Kind() == reflect.Interface && !source.IsNil() { source = source.Elem() }
 *     if !source.IsValid() || source.Kind() == reflect.Interface {     // absent, ou nil
 *         if target.Kind() == reflect.Interface { target.Set(reflect.ValueOf(JSUndefined{})); return }
 *         panic("JSAs : " + path + " est absent, " + target.Type().String() + " attendu")
 *     }
 *     if source.Type().AssignableTo(target.Type()) { target.Set(source); return }
 *     if target.Kind() == reflect.Struct {
 *         for index := 0; index < target.NumField(); index += 1 {
 *             name := jsFieldName(target.Type().Field(index))
 *             jsConvert(jsLookup(source, name), target.Field(index), path+"."+name)
 *         }
 *         return
 *     }
 *     if target.Kind() == reflect.Slice && source.Kind() == reflect.Slice {
 *         converted := reflect.MakeSlice(target.Type(), source.Len(), source.Len())
 *         for index := 0; index < source.Len(); index += 1 {
 *             jsConvert(source.Index(index), converted.Index(index), path+"["+strconv.Itoa(index)+"]")
 *         }
 *         target.Set(converted)
 *         return
 *     }
 *     panic("JSAs : " + path + " est un " + source.Type().String() + ", " + target.Type().String() + " attendu")
 * }
 * ```
 */
function convertFunction() {
	const path = go.id("path");
	const typeName = (value: string) => method(method(value, "Type"), "String");
	const index = go.id("index");

	return go.function({
		name: "jsConvert",
		parameters: [
			go.parameter("source", reflectValue),
			go.parameter("target", reflectValue),
			go.parameter("path", string),
		],
		body: [
			unwrapInterface("source"),
			go.when(go.binary(go.not(method("source", "IsValid")), "||", kindIs("source", "Interface")), [
				go.when(kindIs("target", "Interface"), [
					method("target", "Set", [go.call(reflect("ValueOf"), [go.empty("JSUndefined")])]),
					go.return(),
				]),
				failure(path, go.binary(go.binary(go.string(" est absent, "), "+", typeName("target")), "+", go.string(" attendu"))),
			]),
			go.when(method(method("source", "Type"), "AssignableTo", [method("target", "Type")]), [
				method("target", "Set", [go.id("source")]),
				go.return(),
			]),
			go.when(kindIs("target", "Struct"), [
				countTo(method("target", "NumField"), [
					go.declare("name", go.call("jsFieldName", [method(method("target", "Type"), "Field", [index])])),
					go.call("jsConvert", [
						go.call("jsLookup", [go.id("source"), go.id("name")]),
						method("target", "Field", [index]),
						go.binary(go.binary(path, "+", go.string(".")), "+", go.id("name")),
					]),
				]),
				go.return(),
			]),
			go.when(go.binary(kindIs("target", "Slice"), "&&", kindIs("source", "Slice")), [
				go.declare("converted", go.call(reflect("MakeSlice"), [
					method("target", "Type"),
					method("source", "Len"),
					method("source", "Len"),
				])),
				countTo(method("source", "Len"), [
					go.call("jsConvert", [
						method("source", "Index", [index]),
						method("converted", "Index", [index]),
						go.binary(
							go.binary(go.binary(path, "+", go.string("[")), "+", go.call(go.select("strconv", "Itoa"), [index])),
							"+",
							go.string("]"),
						),
					]),
				]),
				method("target", "Set", [go.id("converted")]),
				go.return(),
			]),
			failure(
				path,
				go.binary(
					go.binary(go.binary(go.string(" est un "), "+", typeName("source")), "+", go.string(", ")),
					"+",
					go.binary(typeName("target"), "+", go.string(" attendu")),
				),
			),
		],
	});
}

function asFunction() {
	return go.function({
		name: "JSAs",
		generic: [["T", any]],
		parameters: [go.parameter("value", any)],
		returns: go.id("T"),
		body: [
			go.variable("result", go.id("T")),
			go.call("jsConvert", [
				go.call(reflect("ValueOf"), [go.id("value")]),
				method(go.call(reflect("ValueOf"), [GoAST.createAddressExpression({ operand: go.id("result") })]), "Elem"),
				go.string("valeur"),
			]),
			go.return(go.id("result")),
		],
	});
}

/**
 * ```go
 * func JSGetProperty(value any, name string) any {
 *     found := jsLookup(reflect.ValueOf(value), name)
 *     if found.IsValid() { return found.Interface() }
 *     reflected := reflect.ValueOf(value)
 *     if name == "length" && reflected.Kind() == reflect.Slice { return float64(reflected.Len()) }
 *     if name == "length" && reflected.Kind() == reflect.String { return JSStringLength(reflected.String()) }
 *     return JSUndefined{}
 * }
 * ```
 */
function getPropertyFunction() {
	const isLength = go.binary(go.id("name"), "==", go.string("length"));

	return go.function({
		name: "JSGetProperty",
		parameters: [go.parameter("value", any), go.parameter("name", string)],
		returns: any,
		body: [
			go.declare("found", go.call("jsLookup", [go.call(reflect("ValueOf"), [go.id("value")]), go.id("name")])),
			go.when(method("found", "IsValid"), [go.return(method("found", "Interface"))]),
			go.declare("reflected", go.call(reflect("ValueOf"), [go.id("value")])),
			go.when(go.binary(isLength, "&&", kindIs("reflected", "Slice")), [
				go.return(go.convert(float64, method("reflected", "Len"))),
			]),
			go.when(go.binary(isLength, "&&", kindIs("reflected", "String")), [
				go.return(go.call("JSStringLength", [method("reflected", "String")])),
			]),
			go.return(go.empty("JSUndefined")),
		],
	});
}

export const javascriptObjectsDependency = DCommon.memo(() => createSharedDependency({
	imports: [
		GoAST.createImportDeclaration({ path: "reflect" }),
		GoAST.createImportDeclaration({ path: "strconv" }),
	],
	init: [],
	declarations: [
		fieldNameFunction(),
		lookupFunction(),
		convertFunction(),
		asFunction(),
		getPropertyFunction(),
	],
}));

function register(context: BuildContext) {
	context.registerSharedDependency(nullShardDependency.value);
	context.registerSharedDependency(undefinedShardDependency.value);
	// `JSGetProperty` lit `.length` d'une chaîne en UTF-16.
	context.registerSharedDependency(jsStringDependency.value);

	return context.registerSharedDependency(javascriptObjectsDependency.value);
}

/** `shard_dependencies.JSAs[T](value)` : un `any` utilisé comme objet typé. */
export function asTyped(context: BuildContext, value: GoAST.Expression, type: GoTypeNode) {
	return go.call(
		GoAST.createInstantiationExpression({
			target: GoAST.createSelectorExpression({
				target: register(context),
				identifier: go.id("JSAs"),
			}),
			typeArguments: DCommon.cast([type]),
		}),
		[value],
	);
}

/** `shard_dependencies.JSGetProperty(value, "name")` : `value.name` sur un `any`. */
export function getProperty(context: BuildContext, value: GoAST.Expression, name: GoAST.Expression) {
	return go.call(
		GoAST.createSelectorExpression({
			target: register(context),
			identifier: go.id("JSGetProperty"),
		}),
		[value, name],
	);
}

/** Les types qu'une assertion `x.(T)` ne suffit pas à ouvrir : objets et tableaux. */
export function needsConversion(renderedType: string) {
	return renderedType.startsWith("struct") || renderedType.startsWith("[]");
}

