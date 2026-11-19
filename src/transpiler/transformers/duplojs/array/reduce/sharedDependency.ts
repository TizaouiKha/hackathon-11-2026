import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { go, type GoTypeNode } from "../../../shared/goBuilder";
import { jsonTag } from "../../../type/tsTypeToGo";

/**
 * `DArray.reduce` (D-23).
 *
 * En DuploJS, le callback reçoit un objet d'outils et dit comment continuer :
 * ```ts
 * DArray.reduce(list, 0, ({ element, lastValue, next, exit }) =>
 *     element > 3 ? exit(lastValue) : next(lastValue + element));
 * ```
 * En Go, cet objet est un struct dont `next`, `exit` et `nextPush` sont des
 * fonctions. Elles renvoient une `ReduceStep` : continuer avec `Value`, ou
 * s'arrêter (`Exit`) et renvoyer `Value`.
 * ```go
 * type ReduceStep struct { Exit bool; Value any }
 * func Reduce[T any, O any](input []T, from O, theFunction func(P) ReduceStep) any
 * func ReducePush[T any, E any](input []T, from []E, theFunction func(P) ReduceStep) any // avec nextPush
 * ```
 * Le struct `P` est construit par `reduceParamsType`, à la fois ici (avec `T`,
 * `O`) et par `tsTypeToGo` pour le paramètre du callback (avec les vrais types) :
 * Go exige deux structs strictement identiques.
 */

export const reduceStepIdentifier = GoAST.createIdentifier("ReduceStep");
export const reduceIdentifier = GoAST.createIdentifier("Reduce");
export const reducePushIdentifier = GoAST.createIdentifier("ReducePush");

const stepFields = {
	exit: GoAST.createIdentifier("Exit"),
	value: GoAST.createIdentifier("Value"),
} as const;

const paramsFieldNames = ["element", "index", "lastValue", "self", "next", "exit", "nextPush"] as const;

function sourced(name: (typeof paramsFieldNames)[number]) {
	return GoAST.createIdentifier(`Sourced_${name}`);
}

/**
 * `struct{ element T; index float64; lastValue O; self []T; next func(O) ReduceStep;
 * exit func(any) ReduceStep; nextPush func(O, ...E) ReduceStep }` (`nextPush`
 * seulement si `pushElement` est donné, c'est-à-dire si `O` est un tableau).
 * `stepType` : `ReduceStep` dans le paquet partagé, ou `shard_dependencies.ReduceStep` ailleurs.
 */
export function reduceParamsType(params: {
	readonly element: GoTypeNode;
	readonly output: GoTypeNode;
	readonly pushElement?: GoTypeNode;
	readonly stepType: GoTypeNode;
}) {
	const step = (parameters: readonly GoTypeNode[], variadic?: GoTypeNode) => GoAST.createFunctionType({
		arguments: parameters.map((type, index) => go.parameter(`p${index}`, type)),
		variadicArgument: variadic ? go.parameter("values", variadic) : undefined,
		returnTypes: [params.stepType],
	});
	const fieldTypes: Record<(typeof paramsFieldNames)[number], GoTypeNode | undefined> = {
		element: params.element,
		index: go.types.float64,
		lastValue: params.output,
		self: GoAST.createSliceType({ elementType: params.element }),
		next: step([params.output]),
		exit: step([go.types.any]),
		nextPush: params.pushElement ? step([params.output], params.pushElement) : undefined,
	};

	return GoAST.createStructType({
		fields: paramsFieldNames.flatMap((name) => {
			const typeReference = fieldTypes[name];

			return typeReference
				? [
					GoAST.createStructField({
						identifier: sourced(name),
						typeReference,
						tag: jsonTag(name),
					}),
				]
				: [];
		}),
	});
}

function stepLiteral(exit: boolean, value: GoAST.Expression) {
	return GoAST.createStructLiteral({
		typeReference: reduceStepIdentifier,
		elements: [
			GoAST.createKeyedElement({
				key: stepFields.exit,
				value: go.bool(exit),
			}),
			GoAST.createKeyedElement({
				key: stepFields.value,
				value,
			}),
		],
	});
}

function toolLiteral(
	parameters: readonly GoAST.FunctionArgument[],
	body: GoAST.Expression,
	variadic?: GoAST.FunctionArgument,
) {
	return GoAST.createFunctionLiteral({
		arguments: parameters,
		variadicArgument: variadic,
		returnTypes: [reduceStepIdentifier],
		body: go.block([go.return(body)]),
	});
}

function reduceFunction(withPush: boolean) {
	const element = go.id("T");
	const output = withPush ? GoAST.createSliceType({ elementType: go.id("E") }) : go.id("O");
	const paramsType = reduceParamsType({
		element,
		output,
		pushElement: withPush ? go.id("E") : undefined,
		stepType: reduceStepIdentifier,
	});
	const tools = [
		GoAST.createKeyedElement({
			key: sourced("next"),
			value: toolLiteral([go.parameter("value", output)], stepLiteral(false, go.id("value"))),
		}),
		GoAST.createKeyedElement({
			key: sourced("exit"),
			value: toolLiteral([go.parameter("value", go.types.any)], stepLiteral(true, go.id("value"))),
		}),
	];

	if (withPush) {
		// nextPush : une copie de `array` complétée par `values`, comme `DArray.push`.
		tools.push(GoAST.createKeyedElement({
			key: sourced("nextPush"),
			value: toolLiteral(
				[go.parameter("array", output)],
				stepLiteral(false, GoAST.createCallExpression({
					callee: go.id("append"),
					arguments: [
						GoAST.createCallExpression({
							callee: go.id("append"),
							arguments: [
								GoAST.createCallExpression({
									callee: go.id("make"),
									typeArgument: output,
									arguments: [
										go.int(0),
										go.binary(go.call("len", [go.id("array")]), "+", go.call("len", [go.id("values")])),
									],
								}),
							],
							variadicArgument: go.id("array"),
						}),
					],
					variadicArgument: go.id("values"),
				})),
				go.parameter("values", go.id("E")),
			),
		}));
	}

	return go.function({
		name: withPush ? reducePushIdentifier.value : reduceIdentifier.value,
		generic: withPush ? [["T", go.types.any], ["E", go.types.any]] : [["T", go.types.any], ["O", go.types.any]],
		parameters: [
			go.parameter("input", GoAST.createSliceType({ elementType: element })),
			go.parameter("from", output),
			go.parameter("theFunction", GoAST.createFunctionType({
				arguments: [go.parameter("params", paramsType)],
				returnTypes: [reduceStepIdentifier],
			})),
		],
		returns: go.types.any,
		body: [
			go.declare("lastValue", go.id("from")),
			GoAST.createRangeStatement({
				binding: GoAST.createRangeDeclaration({
					key: go.id("index"),
					value: go.id("element"),
				}),
				expression: go.id("input"),
				body: go.block([
					go.declare("step", go.call("theFunction", [
						GoAST.createStructLiteral({
							typeReference: paramsType,
							elements: [
								GoAST.createKeyedElement({
									key: sourced("element"),
									value: go.id("element"),
								}),
								GoAST.createKeyedElement({
									key: sourced("index"),
									value: go.convert(go.types.float64, go.id("index")),
								}),
								GoAST.createKeyedElement({
									key: sourced("lastValue"),
									value: go.id("lastValue"),
								}),
								GoAST.createKeyedElement({
									key: sourced("self"),
									value: go.id("input"),
								}),
								...tools,
							],
						}),
					])),
					go.when(go.select("step", "Exit"), [go.return(go.select("step", "Value"))]),
					go.assign([go.id("lastValue")], [go.assert(go.select("step", "Value"), output)]),
				]),
			}),
			go.return(go.id("lastValue")),
		],
	});
}

export const reduceDependency = DCommon.memo(() => createSharedDependency({
	imports: [],
	init: [],
	declarations: [
		GoAST.createTypeDefinition({
			identifier: reduceStepIdentifier,
			type: GoAST.createStructType({
				fields: [
					GoAST.createStructField({
						identifier: stepFields.exit,
						typeReference: go.types.bool,
					}),
					GoAST.createStructField({
						identifier: stepFields.value,
						typeReference: go.types.any,
					}),
				],
			}),
		}),
		reduceFunction(false),
		reduceFunction(true),
	],
}));
