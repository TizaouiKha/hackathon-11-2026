import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { eitherAnyTypeIdentifier, eitherFieldIdentifiers, eitherTagTypeIdentifier } from "../core/sharedDependency";

export const asyncGroupIdentifier = GoAST.createIdentifier("AsyncGroup");
export const asyncGroupObjectIdentifier = GoAST.createIdentifier("AsyncGroupObject");

/**
 * Exécution synchrone et séquentielle de `DEither.asyncGroup` (D-11).
 * Le premier Left est renvoyé immédiatement; sinon les valeurs ouvertes sont
 * regroupées dans un Success. `E` est le type des entrées et `T` celui de leurs
 * valeurs Right, tous deux fournis par le handler depuis le checker.
 */
export const asyncGroupDependency = DCommon.memo(() => {
	const entryType = GoAST.createIdentifier("E");
	const elementType = GoAST.createIdentifier("T");
	const entries = GoAST.createIdentifier("entries");
	const resolve = GoAST.createIdentifier("resolve");
	const successTag = GoAST.createIdentifier("successTag");
	const output = GoAST.createIdentifier("output");
	const index = GoAST.createIdentifier("index");
	const entry = GoAST.createIdentifier("entry");
	const result = GoAST.createIdentifier("result");
	const outputType = GoAST.createSliceType({ elementType });
	const objectOutputType = GoAST.createIdentifier("O");
	const objectEntries = GoAST.createIdentifier("objectEntries");
	const setters = GoAST.createIdentifier("setters");
	const objectOutput = GoAST.createIdentifier("objectOutput");
	const objectIndex = GoAST.createIdentifier("objectIndex");
	const getter = GoAST.createIdentifier("getter");
	const objectResult = GoAST.createIdentifier("objectResult");

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: asyncGroupIdentifier,
				generic: [
					GoAST.createTypeParameter({
						identifier: entryType,
						constraint: GoAST.builtinTypeReferences.any,
					}),
					GoAST.createTypeParameter({
						identifier: elementType,
						constraint: GoAST.builtinTypeReferences.any,
					}),
				],
				arguments: [
					GoAST.createFunctionArgument({
						identifier: entries,
						type: GoAST.createSliceType({
							elementType: entryType,
						}),
					}),
					GoAST.createFunctionArgument({
						identifier: resolve,
						type: GoAST.createFunctionType({
							arguments: [
								GoAST.createFunctionArgument({
									identifier: GoAST.createIdentifier("p0"),
									type: entryType,
								}),
							],
							returnTypes: [eitherAnyTypeIdentifier],
						}),
					}),
					GoAST.createFunctionArgument({
						identifier: successTag,
						type: eitherTagTypeIdentifier,
					}),
				],
				returnTypes: [eitherAnyTypeIdentifier],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createShortVariableDeclarationStatement({
							identifier: output,
							initializer: GoAST.createCallExpression({
								callee: GoAST.createIdentifier("make"),
								arguments: [
									outputType as unknown as GoAST.Expression,
									GoAST.createCallExpression({
										callee: GoAST.createIdentifier("len"),
										arguments: [entries],
									}),
								],
							}),
						}),
						GoAST.createRangeStatement({
							binding: GoAST.createRangeDeclaration({
								key: index,
								value: entry,
							}),
							expression: entries,
							body: GoAST.createBlockStatement({
								statements: [
									GoAST.createShortVariableDeclarationStatement({
										identifier: result,
										initializer: GoAST.createCallExpression({
											callee: resolve,
											arguments: [entry],
										}),
									}),
									GoAST.createIfStatement({
										condition: GoAST.createCallExpression({
											callee: GoAST.createSelectorExpression({
												target: GoAST.createSelectorExpression({
													target: result,
													identifier: eitherFieldIdentifiers.tag,
												}),
												identifier: GoAST.createIdentifier("IsLeft"),
											}),
											arguments: [],
										}),
										body: GoAST.createBlockStatement({
											statements: [GoAST.createReturnStatement({ values: [result] })],
										}),
									}),
									GoAST.createAssignmentStatement({
										targets: DCommon.cast([
											GoAST.createIndexExpression({
												target: output,
												index,
											}),
										]),
										values: DCommon.cast([
											GoAST.createTypeAssertionExpression({
												target: GoAST.createSelectorExpression({
													target: result,
													identifier: eitherFieldIdentifiers.value,
												}),
												typeReference: elementType,
											}),
										]),
									}),
								],
							}),
						}),
						GoAST.createReturnStatement({
							values: [
								GoAST.createStructLiteral({
									typeReference: eitherAnyTypeIdentifier,
									elements: [
										GoAST.createKeyedElement({
											key: eitherFieldIdentifiers.tag,
											value: successTag,
										}),
										GoAST.createKeyedElement({
											key: eitherFieldIdentifiers.value,
											value: output,
										}),
									],
								}),
							],
						}),
					],
				}),
			}),
			GoAST.createFunctionDeclaration({
				identifier: asyncGroupObjectIdentifier,
				generic: [
					GoAST.createTypeParameter({
						identifier: objectOutputType,
						constraint: GoAST.builtinTypeReferences.any,
					}),
				],
				arguments: [
					GoAST.createFunctionArgument({
						identifier: objectEntries,
						type: GoAST.createSliceType({
							elementType: GoAST.createFunctionType({
								arguments: [],
								returnTypes: [eitherAnyTypeIdentifier],
							}),
						}),
					}),
					GoAST.createFunctionArgument({
						identifier: setters,
						type: GoAST.createSliceType({
							elementType: GoAST.createFunctionType({
								arguments: [
									GoAST.createFunctionArgument({
										identifier: GoAST.createIdentifier("p0"),
										type: GoAST.createPointerType({ typeReference: objectOutputType }),
									}),
									GoAST.createFunctionArgument({
										identifier: GoAST.createIdentifier("p1"),
										type: GoAST.builtinTypeReferences.any,
									}),
								],
								returnTypes: [],
							}),
						}),
					}),
					GoAST.createFunctionArgument({
						identifier: successTag,
						type: eitherTagTypeIdentifier,
					}),
				],
				returnTypes: [eitherAnyTypeIdentifier],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createVariableDeclarationZeroValue({
							identifier: objectOutput,
							typeReference: objectOutputType,
						}),
						GoAST.createRangeStatement({
							binding: GoAST.createRangeDeclaration({
								key: objectIndex,
								value: getter,
							}),
							expression: objectEntries,
							body: GoAST.createBlockStatement({
								statements: [
									GoAST.createShortVariableDeclarationStatement({
										identifier: objectResult,
										initializer: GoAST.createCallExpression({
											callee: getter,
											arguments: [],
										}),
									}),
									GoAST.createIfStatement({
										condition: GoAST.createCallExpression({
											callee: GoAST.createSelectorExpression({
												target: GoAST.createSelectorExpression({
													target: objectResult,
													identifier: eitherFieldIdentifiers.tag,
												}),
												identifier: GoAST.createIdentifier("IsLeft"),
											}),
											arguments: [],
										}),
										body: GoAST.createBlockStatement({
											statements: [GoAST.createReturnStatement({ values: [objectResult] })],
										}),
									}),
									GoAST.createCallExpression({
										callee: GoAST.createIndexExpression({
											target: setters,
											index: objectIndex,
										}),
										arguments: [
											GoAST.createAddressExpression({ operand: objectOutput }),
											GoAST.createSelectorExpression({
												target: objectResult,
												identifier: eitherFieldIdentifiers.value,
											}),
										],
									}),
								],
							}),
						}),
						GoAST.createReturnStatement({
							values: [
								GoAST.createStructLiteral({
									typeReference: eitherAnyTypeIdentifier,
									elements: [
										GoAST.createKeyedElement({
											key: eitherFieldIdentifiers.tag,
											value: successTag,
										}),
										GoAST.createKeyedElement({
											key: eitherFieldIdentifiers.value,
											value: objectOutput,
										}),
									],
								}),
							],
						}),
					],
				}),
			}),
		],
	});
});
