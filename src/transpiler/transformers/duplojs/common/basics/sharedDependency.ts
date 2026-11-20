import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { go } from "../../../shared/goBuilder";

/**
 * Helpers Go des fonctions `DCommon` de base (D-26).
 * ```go
 * func When[I any, R any](input I, predicate func(I) bool, theFunction func(I) R) any      // R ou I
 * func WhenNot[I any, R any](input I, predicate func(I) bool, theFunction func(I) R) any
 * func WhenElse[I any, R any, S any](input I, predicate func(I) bool, then func(I) R, otherwise func(I) S) any
 * func Tap[I any, R any](input I, theFunction func(I) R) I       // appelle, puis renvoie l'entrée
 * func JSEqualOneOf(input any, values ...any) bool              // DCommon.equal(x, [a, b])
 * func JSTruthy(value any) bool                                 // !!value
 * func JSIsType(value any, kind string) bool                     // DCommon.isType(x, "string")
 * ```
 * `When*` renvoient `any` (TypeScript leur donne une union) ; le handler ouvre
 * la valeur vers le type TS du résultat quand il est précis.
 */

export const commonHelperNames = {
	when: "When",
	whenNot: "WhenNot",
	whenElse: "WhenElse",
	tap: "Tap",
	equalOneOf: "JSEqualOneOf",
	truthy: "JSTruthy",
	isType: "JSIsType",
} as const;

const input = go.id("input");
const value = go.id("value");
const typeI = go.id("I");
const unary = (returns: GoAST.TypeReference | GoAST.Type) => GoAST.createFunctionType({
	arguments: [go.parameter("p0", typeI)],
	returnTypes: [returns],
});
const predicateType = unary(go.types.bool);
const callPredicate = go.call("predicate", [input]);

function conditional(name: "when" | "whenNot") {
	return go.function({
		name: commonHelperNames[name],
		generic: [["I", go.types.any], ["R", go.types.any]],
		parameters: [
			go.parameter("input", typeI),
			go.parameter("predicate", predicateType),
			go.parameter("theFunction", unary(go.id("R"))),
		],
		returns: go.types.any,
		body: [
			go.when(name === "when" ? callPredicate : go.not(callPredicate), [go.return(go.call("theFunction", [input]))]),
			go.return(input),
		],
	});
}

function typeCase(type: GoAST.TypeReference, statements: readonly GoAST.Statement[]) {
	return GoAST.createTypeSwitchCase({
		types: DCommon.cast([type]),
		statements,
	});
}

export const commonBasicsDependency = DCommon.memo(() => createSharedDependency({
	imports: [],
	init: [],
	declarations: [
		conditional("when"),
		conditional("whenNot"),
		go.function({
			name: commonHelperNames.whenElse,
			generic: [["I", go.types.any], ["R", go.types.any], ["S", go.types.any]],
			parameters: [
				go.parameter("input", typeI),
				go.parameter("predicate", predicateType),
				go.parameter("then", unary(go.id("R"))),
				go.parameter("otherwise", unary(go.id("S"))),
			],
			returns: go.types.any,
			body: [
				go.when(callPredicate, [go.return(go.call("then", [input]))]),
				go.return(go.call("otherwise", [input])),
			],
		}),
		go.function({
			name: commonHelperNames.tap,
			generic: [["I", go.types.any], ["R", go.types.any]],
			parameters: [go.parameter("input", typeI), go.parameter("theFunction", unary(go.id("R")))],
			returns: typeI,
			body: [
				go.call("theFunction", [input]) as unknown as GoAST.Statement,
				go.return(input),
			],
		}),
		go.function({
			name: commonHelperNames.equalOneOf,
			parameters: [go.parameter("input", go.types.any)],
			variadic: go.parameter("values", go.types.any),
			returns: go.types.bool,
			body: [
				GoAST.createRangeStatement({
					binding: GoAST.createRangeDeclaration({
						key: go.id("_"),
						value,
					}),
					expression: go.id("values"),
					body: go.block([go.when(go.binary(input, "==", value), [go.return(go.bool(true))])]),
				}),
				go.return(go.bool(false)),
			],
		}),
		// !!value de JavaScript : faux pour false, 0, -0, NaN, "", undefined et null.
		go.function({
			name: commonHelperNames.truthy,
			parameters: [go.parameter("value", go.types.any)],
			returns: go.types.bool,
			body: [
				GoAST.createTypeSwitchStatementWithoutDefault({
					expression: value,
					cases: [
						typeCase(go.types.bool, [go.return(go.assert(value, go.types.bool))]),
						typeCase(go.types.float64, [
							go.declare("number", go.assert(value, go.types.float64)),
							go.return(go.binary(
								go.binary(go.id("number"), "==", go.id("number")),
								"&&",
								go.binary(go.id("number"), "!=", go.int(0)),
							)),
						]),
						typeCase(go.types.string, [go.return(go.binary(go.assert(value, go.types.string), "!=", go.string("")))]),
						typeCase(go.id("JSUndefined"), [go.return(go.bool(false))]),
						typeCase(go.id("JSNull"), [go.return(go.bool(false))]),
					],
				}),
				go.return(go.binary(value, "!=", GoAST.createNilLiteral({}))),
			],
		}),
		// isType : `null` à part (typeof null vaut "object"), le reste par JSTypeOf.
		go.function({
			name: commonHelperNames.isType,
			parameters: [go.parameter("value", go.types.any), go.parameter("kind", go.types.string)],
			returns: go.types.bool,
			body: [
				go.declare("isNull", go.binary(value, "==", go.empty("JSNull"))),
				go.when(go.binary(go.id("kind"), "==", go.string("null")), [go.return(go.id("isNull"))]),
				go.return(go.binary(go.call("JSTypeOf", [value]), "==", go.id("kind"))),
			],
		}),
	],
}));
