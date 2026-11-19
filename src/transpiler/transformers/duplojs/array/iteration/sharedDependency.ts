import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { go } from "../../../shared/goBuilder";
import { mapParamsFieldIdentifiers, mapParamsType } from "../map/sharedDependency";

/**
 * Helpers Go des fonctions `DArray` (étape 12, lot DArray). Les callbacks
 * reçoivent, comme `map`, l'élément et `{ index, self }`.
 *
 * ```go
 * func Filter[T any](input []T, predicate func(T, P) bool) []T
 * func Find[T any](input []T, predicate func(T, P) bool) any        // élément ou JSUndefined{}
 * func FindIndex[T any](input []T, predicate func(T, P) bool) any   // float64 ou JSUndefined{}
 * func Some[T any](input []T, predicate func(T, P) bool) bool
 * func Every[T any](input []T, predicate func(T, P) bool) bool
 * func Includes[T comparable](input []T, value T) bool            // NaN trouvé, comme JS
 * func Push[T any](input []T, values ...T) []T                    // nouvelle slice
 * func Concat[T any](input []T, others ...[]T) []T                // nouvelle slice
 * ```
 * `Find` et `FindIndex` renvoient `undefined` quand rien ne correspond, comme
 * DuploJS (et non `-1` pour `findIndex`).
 */

export const arrayIterationIdentifiers = {
	filter: GoAST.createIdentifier("Filter"),
	find: GoAST.createIdentifier("Find"),
	findIndex: GoAST.createIdentifier("FindIndex"),
	some: GoAST.createIdentifier("Some"),
	every: GoAST.createIdentifier("Every"),
	includes: GoAST.createIdentifier("Includes"),
	push: GoAST.createIdentifier("Push"),
	concat: GoAST.createIdentifier("Concat"),
} as const;

export type PredicateFunctionName = "filter" | "find" | "findIndex" | "some" | "every";

const elementType = go.id("T");
const inputType = GoAST.createSliceType({ elementType });
const paramsType = mapParamsType(inputType);
const predicateType = GoAST.createFunctionType({
	arguments: [go.parameter("p0", elementType), go.parameter("p1", paramsType)],
	returnTypes: [go.types.bool],
});

const undefinedValue = go.empty("JSUndefined");

/** `for index, element := range input { if predicate(element, P{…}) { <matched> } }` */
function forEachMatch(matched: readonly GoAST.Statement[]) {
	return GoAST.createRangeStatement({
		binding: GoAST.createRangeDeclaration({
			key: go.id("index"),
			value: go.id("element"),
		}),
		expression: go.id("input"),
		body: go.block([
			go.when(
				go.call("predicate", [
					go.id("element"),
					GoAST.createStructLiteral({
						typeReference: paramsType,
						elements: [
							GoAST.createKeyedElement({
								key: mapParamsFieldIdentifiers.index,
								value: go.convert(go.types.float64, go.id("index")),
							}),
							GoAST.createKeyedElement({
								key: mapParamsFieldIdentifiers.self,
								value: go.id("input"),
							}),
						],
					}),
				]),
				matched,
			),
		]),
	});
}

function predicateFunction(
	name: PredicateFunctionName,
	returns: GoAST.TypeReference | GoAST.Type,
	body: readonly GoAST.Statement[],
) {
	return go.function({
		name: arrayIterationIdentifiers[name].value,
		generic: [["T", go.types.any]],
		parameters: [go.parameter("input", inputType), go.parameter("predicate", predicateType)],
		returns,
		body,
	});
}

function makeSlice(type: GoAST.SliceType, length: GoAST.Expression, capacity: GoAST.Expression) {
	return GoAST.createCallExpression({
		callee: go.id("make"),
		typeArgument: type,
		arguments: [length, capacity],
	});
}

function append(target: GoAST.Expression, spread: GoAST.Expression) {
	return GoAST.createCallExpression({
		callee: go.id("append"),
		arguments: [target],
		variadicArgument: spread,
	});
}

const len = (value: GoAST.Expression) => go.call("len", [value]);

export const arrayIterationDependency = DCommon.memo(() => createSharedDependency({
	imports: [],
	init: [],
	declarations: [
		predicateFunction("filter", inputType, [
			go.declare("output", makeSlice(inputType, go.int(0), len(go.id("input")))),
			forEachMatch([go.assign([go.id("output")], [go.call("append", [go.id("output"), go.id("element")])])]),
			go.return(go.id("output")),
		]),
		predicateFunction("find", go.types.any, [
			forEachMatch([go.return(go.id("element"))]),
			go.return(undefinedValue),
		]),
		predicateFunction("findIndex", go.types.any, [
			forEachMatch([go.return(go.convert(go.types.float64, go.id("index")))]),
			go.return(undefinedValue),
		]),
		predicateFunction("some", go.types.bool, [
			forEachMatch([go.return(go.bool(true))]),
			go.return(go.bool(false)),
		]),
		// every : faux dès qu'un élément ne passe pas.
		go.function({
			name: arrayIterationIdentifiers.every.value,
			generic: [["T", go.types.any]],
			parameters: [go.parameter("input", inputType), go.parameter("predicate", predicateType)],
			returns: go.types.bool,
			body: [
				go.return(go.not(go.call("Some", [
					go.id("input"),
					GoAST.createFunctionLiteral({
						arguments: [go.parameter("element", elementType), go.parameter("params", paramsType)],
						returnTypes: [go.types.bool],
						body: go.block([go.return(go.not(go.call("predicate", [go.id("element"), go.id("params")])))]),
					}),
				]))),
			],
		}),
		// includes : SameValueZero de JS, `NaN` est trouvé (en Go, NaN != NaN).
		go.function({
			name: arrayIterationIdentifiers.includes.value,
			generic: [["T", go.types.comparable]],
			parameters: [go.parameter("input", inputType), go.parameter("value", elementType)],
			returns: go.types.bool,
			body: [
				go.declare("isNaN", go.binary(go.id("value"), "!=", go.id("value"))),
				GoAST.createRangeStatement({
					binding: GoAST.createRangeDeclaration({
						key: go.id("_"),
						value: go.id("element"),
					}),
					expression: go.id("input"),
					body: go.block([
						go.when(
							go.binary(
								go.binary(go.id("element"), "==", go.id("value")),
								"||",
								go.binary(go.id("isNaN"), "&&", go.binary(go.id("element"), "!=", go.id("element"))),
							),
							[go.return(go.bool(true))],
						),
					]),
				}),
				go.return(go.bool(false)),
			],
		}),
		// push : DuploJS renvoie une copie, l'entrée n'est pas modifiée.
		go.function({
			name: arrayIterationIdentifiers.push.value,
			generic: [["T", go.types.any]],
			parameters: [go.parameter("input", inputType)],
			variadic: go.parameter("values", elementType),
			returns: inputType,
			body: [
				go.declare("output", makeSlice(
					inputType,
					go.int(0),
					go.binary(len(go.id("input")), "+", len(go.id("values"))),
				)),
				go.assign([go.id("output")], [append(go.id("output"), go.id("input"))]),
				go.return(append(go.id("output"), go.id("values"))),
			],
		}),
		go.function({
			name: arrayIterationIdentifiers.concat.value,
			generic: [["T", go.types.any]],
			parameters: [go.parameter("input", inputType)],
			variadic: go.parameter("others", inputType),
			returns: inputType,
			body: [
				go.declare("size", len(go.id("input"))),
				GoAST.createRangeStatement({
					binding: GoAST.createRangeDeclaration({
						key: go.id("_"),
						value: go.id("other"),
					}),
					expression: go.id("others"),
					body: go.block([go.assign([go.id("size")], [go.binary(go.id("size"), "+", len(go.id("other")))])]),
				}),
				go.declare("output", makeSlice(inputType, go.int(0), go.id("size"))),
				go.assign([go.id("output")], [append(go.id("output"), go.id("input"))]),
				GoAST.createRangeStatement({
					binding: GoAST.createRangeDeclaration({
						key: go.id("_"),
						value: go.id("other"),
					}),
					expression: go.id("others"),
					body: go.block([go.assign([go.id("output")], [append(go.id("output"), go.id("other"))])]),
				}),
				go.return(go.id("output")),
			],
		}),
	],
}));
