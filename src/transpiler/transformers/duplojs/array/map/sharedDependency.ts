import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const mapIdentifier = GoAST.createIdentifier("Map");

/**
 * Champs du second paramètre du callback (`MapTheFunctionParams` de DuploJS,
 * `{ index: number; self: GenericArray }`). Ils doivent porter les **mêmes noms**
 * que ceux produits par `tsTypeToGo` pour un objet (`createSourceIdentifier`) :
 * Go ne considère deux structs anonymes identiques que si leurs champs le sont.
 */
export const mapParamsFieldIdentifiers = {
	index: GoAST.createIdentifier("Sourced_index"),
	self: GoAST.createIdentifier("Sourced_self"),
} as const;

/** `struct{ Sourced_index float64; Sourced_self <array> }` */
export function mapParamsType(arrayType: GoAST.TypeReference | GoAST.Type) {
	return GoAST.createStructType({
		fields: [
			GoAST.createStructField({
				identifier: mapParamsFieldIdentifiers.index,
				typeReference: GoAST.builtinTypeReferences.float64,
			}),
			GoAST.createStructField({
				identifier: mapParamsFieldIdentifiers.self,
				typeReference: arrayType,
			}),
		],
	});
}

/**
 * ```go
 * func Map[T any, U any](input []T, theFunction func(T, struct{ Sourced_index float64; Sourced_self []T }) U) []U {
 *     output := make([]U, len(input))
 *     for index, element := range input {
 *         output[index] = theFunction(element, struct{ … }{Sourced_index: float64(index), Sourced_self: input})
 *     }
 *     return output
 * }
 * ```
 * Une seule allocation (la slice de sortie, à sa taille finale) ; le second
 * paramètre est un struct passé par valeur, sans allocation.
 */
export const mapDependency = DCommon.memo(() => {
	const elementType = GoAST.createIdentifier("T");
	const outputElementType = GoAST.createIdentifier("U");
	const input = GoAST.createIdentifier("input");
	const theFunction = GoAST.createIdentifier("theFunction");
	const output = GoAST.createIdentifier("output");
	const index = GoAST.createIdentifier("index");
	const element = GoAST.createIdentifier("element");
	const inputType = GoAST.createSliceType({ elementType });
	const outputType = GoAST.createSliceType({ elementType: outputElementType });
	const paramsType = mapParamsType(inputType);

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: mapIdentifier,
				generic: [elementType, outputElementType].map((identifier) => GoAST.createTypeParameter({
					identifier,
					constraint: GoAST.builtinTypeReferences.any,
				})),
				arguments: [
					GoAST.createFunctionArgument({
						identifier: input,
						type: inputType,
					}),
					GoAST.createFunctionArgument({
						identifier: theFunction,
						type: GoAST.createFunctionType({
							arguments: [
								GoAST.createFunctionArgument({
									identifier: GoAST.createIdentifier("p0"),
									type: elementType,
								}),
								GoAST.createFunctionArgument({
									identifier: GoAST.createIdentifier("p1"),
									type: paramsType,
								}),
							],
							returnTypes: [outputElementType],
						}),
					}),
				],
				returnTypes: [outputType],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createShortVariableDeclarationStatement({
							identifier: output,
							// `make` reçoit un type : l'AST Go le range parmi les arguments.
							initializer: GoAST.createCallExpression({
								callee: GoAST.createIdentifier("make"),
								arguments: [
									outputType as unknown as GoAST.Expression,
									GoAST.createCallExpression({
										callee: GoAST.createIdentifier("len"),
										arguments: [input],
									}),
								],
							}),
						}),
						GoAST.createRangeStatement({
							binding: GoAST.createRangeDeclaration({
								key: index,
								value: element,
							}),
							expression: input,
							body: GoAST.createBlockStatement({
								statements: [
									GoAST.createAssignmentStatement({
										targets: DCommon.cast([
											GoAST.createIndexExpression({
												target: output,
												index,
											}),
										]),
										values: DCommon.cast([
											GoAST.createCallExpression({
												callee: theFunction,
												arguments: [
													element,
													GoAST.createStructLiteral({
														typeReference: paramsType,
														elements: [
															GoAST.createKeyedElement({
																key: mapParamsFieldIdentifiers.index,
																value: GoAST.createConversionExpression({
																	typeReference: GoAST.builtinTypeReferences.float64,
																	operand: index,
																}),
															}),
															GoAST.createKeyedElement({
																key: mapParamsFieldIdentifiers.self,
																value: input,
															}),
														],
													}),
												],
											}),
										]),
									}),
								],
							}),
						}),
						GoAST.createReturnStatement({ values: DCommon.cast([output]) }),
					],
				}),
			}),
		],
	});
});
