import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DGenerator from "@duplojs/lang/generator";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST, GoPrinter } from "@go";
import { type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { SignatureKind } from "typescript/async";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { tsTypeOfNodeToGo, type GoType } from "../../../type";
import { analyzeEitherOfType, eitherAnyGoType, sideValueGoType } from "../core/analysis";
import { transformCallback } from "../core/callback";
import { readEitherIssues } from "../core/issues";
import { registerEitherTag } from "../core/tag";
import {
	asyncGroupDependency,
	asyncGroupIdentifier,
	asyncGroupObjectIdentifier,
} from "./sharedDependency";

async function transformEntry(node: TsAST.Expression, context: BuildContext) {
	const itemType = await context.transpilation.typeChecker.getTypeAtLocation(node);
	const signatures = await context.transpilation.typeChecker.getSignaturesOfType(
		itemType,
		SignatureKind.Call,
	);
	if (signatures.length > 0) {
		return transformCallback(
			{
				node,
				parameterTypes: [],
				returnType: eitherAnyGoType(context),
			},
			context,
		);
	}

	const awaitedItemType = await context.transpilation.typeChecker.getAwaitedType(itemType) ?? itemType;
	const issues = await readEitherIssues(awaitedItemType, node, context);
	if (DEither.isLeft(issues)) {
		return context.error(node, "async-group-entry-must-be-an-either-or-getter");
	}
	const value = await context.transformPrepared(node, expressionTransformers.value);
	if (DEither.isLeft(value)) {
		return value;
	}

	return context.success({
		before: value.before,
		result: GoAST.createFunctionLiteral({
			arguments: [],
			returnTypes: [eitherAnyGoType(context)],
			body: GoAST.createBlockStatement({
				statements: [GoAST.createReturnStatement({ values: [value.operand] })],
			}),
		}),
	});
}

function readObjectProperty(property: TsAST.ObjectLiteralElementLike) {
	if (TsAST.isPropertyAssignment(property)) {
		const { name } = property;

		return TsAST.isIdentifier(name) || TsAST.isStringLiteral(name)
			? {
				name: name.text,
				value: property.initializer,
			}
			: undefined;
	}
	if (TsAST.isShorthandPropertyAssignment(property) && TsAST.isIdentifier(property.name)) {
		return {
			name: property.name.text,
			value: property.name,
		};
	}

	return undefined;
}

function createObjectSetter(
	field: GoAST.StructField,
	outputType: GoAST.StructType,
	context: BuildContext,
) {
	const output = context.generateIdentifier();
	const value = context.generateIdentifier();

	return GoAST.createFunctionLiteral({
		arguments: [
			GoAST.createFunctionArgument({
				identifier: output,
				type: GoAST.createPointerType({ typeReference: outputType }),
			}),
			GoAST.createFunctionArgument({
				identifier: value,
				type: GoAST.builtinTypeReferences.any,
			}),
		],
		returnTypes: [],
		body: GoAST.createBlockStatement({
			statements: [
				GoAST.createAssignmentStatement({
					targets: DCommon.cast([
						GoAST.createSelectorExpression({
							target: output,
							identifier: field.identifier,
						}),
					]),
					values: DCommon.cast([
						GoAST.createTypeAssertionExpression({
							target: value,
							typeReference: field.typeReference,
						}),
					]),
				}),
			],
		}),
	});
}

async function readStoredArrayLiteral(node: TsAST.Expression, context: BuildContext) {
	if (!TsAST.isIdentifier(node)) {
		return undefined;
	}
	const symbol = await context.transpilation.typeChecker.getSymbolAtLocation(node);
	const declaration = await symbol?.valueDeclaration?.resolve();

	return declaration && TsAST.isVariableDeclaration(declaration)
		&& declaration.initializer && TsAST.isArrayLiteralExpression(declaration.initializer)
		? declaration.initializer
		: undefined;
}

async function createStoredEntryGetter(
	item: TsAST.Expression,
	index: number,
	target: GoAST.Expression,
	context: BuildContext,
) {
	const itemType = await context.transpilation.typeChecker.getTypeAtLocation(item);
	const signatures = await context.transpilation.typeChecker.getSignaturesOfType(
		itemType,
		SignatureKind.Call,
	);
	const indexedEntry = GoAST.createIndexExpression({
		target,
		index: GoAST.createIntegerLiteral({ value: BigInt(index) }),
	});
	let result: GoAST.Expression | undefined = undefined;
	if (signatures.length > 0) {
		const functionType = await tsTypeOfNodeToGo(item, context);
		if (DEither.isLeft(functionType)) {
			return functionType;
		}
		result = GoAST.createCallExpression({
			callee: GoAST.createTypeAssertionExpression({
				target: indexedEntry,
				typeReference: DEither.unwrapRight(functionType),
			}),
			arguments: [],
		});
	} else {
		const awaitedItemType = await context.transpilation.typeChecker.getAwaitedType(itemType) ?? itemType;
		const issues = await readEitherIssues(awaitedItemType, item, context);
		if (DEither.isLeft(issues)) {
			return context.error(item, "async-group-entry-must-be-an-either-or-getter");
		}
		result = GoAST.createTypeAssertionExpression({
			target: indexedEntry,
			typeReference: eitherAnyGoType(context),
		});
	}
	if (!result) {
		return context.error(item, "async-group-stored-entry-could-not-be-resolved");
	}

	return context.success({
		result: GoAST.createFunctionLiteral({
			arguments: [],
			returnTypes: [eitherAnyGoType(context)],
			body: GoAST.createBlockStatement({
				statements: [GoAST.createReturnStatement({ values: [result] })],
			}),
		}),
	});
}

function createResolver(entryType: GoType, callsEntry: boolean, context: BuildContext) {
	const entry = context.generateIdentifier();

	return GoAST.createFunctionLiteral({
		arguments: [
			GoAST.createFunctionArgument({
				identifier: entry,
				type: entryType,
			}),
		],
		returnTypes: [eitherAnyGoType(context)],
		body: GoAST.createBlockStatement({
			statements: [
				GoAST.createReturnStatement({
					values: [
						callsEntry
							? GoAST.createCallExpression({
								callee: entry,
								arguments: [],
							})
							: entry,
					],
				}),
			],
		}),
	});
}

export async function asyncGroupExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node) || node.arguments.length !== 1) {
		return context.error(node, "async-group-expects-one-array");
	}

	const [group] = node.arguments;
	if (!group) {
		return context.error(node, "async-group-expects-one-array");
	}

	const outputType = await context.transpilation.typeChecker.getTypeAtLocation(node);
	const awaitedOutputType = await context.transpilation.typeChecker.getAwaitedType(outputType) ?? outputType;
	const shape = await analyzeEitherOfType(awaitedOutputType, node, context);
	if (DEither.isLeft(shape)) {
		return shape;
	}

	const successValueType = await sideValueGoType(DEither.unwrapRight(shape), "right", node, context);
	if (DEither.isLeft(successValueType)) {
		return successValueType;
	}
	const successType = DEither.unwrapRight(successValueType);

	const getterType = GoAST.createFunctionType({
		arguments: [],
		returnTypes: [eitherAnyGoType(context)],
	});
	if (TsAST.isObjectLiteralExpression(group)) {
		if (!DModeling.hasTagValue(successType, "[node][type]struct")) {
			return context.error(node, "async-group-object-success-must-contain-an-object");
		}
		const objectEntries = await DGenerator.asyncReduce(
			group.properties,
			DGenerator.reduceFrom<{
				before: readonly GoAST.Statement[];
				getters: readonly GoAST.Expression[];
				setters: readonly GoAST.Expression[];
			}>({
				before: [],
				getters: [],
				setters: [],
			}),
			async({ item, lastValue, next, exit }) => {
				const property = readObjectProperty(item);
				if (!property) {
					return exit(context.error(item, "async-group-object-property-not-supported"));
				}
				const fieldIdentifier = context.createSourceIdentifier(property.name);
				const field = DArray.find(
					successType.fields,
					(candidate): candidate is GoAST.StructField => (
						DModeling.hasTagValue(candidate, "[node]struct-field")
						&& candidate.identifier.value === fieldIdentifier.value
					),
				);
				if (!field) {
					return exit(context.error(item, "async-group-object-output-field-not-found"));
				}
				const getterResult = await transformEntry(property.value, context);
				if (DEither.isLeft(getterResult)) {
					return exit(getterResult);
				}
				const getter = DEither.unwrapRight(getterResult);

				return next({
					before: DArray.concat(lastValue.before, getter.before),
					getters: DArray.push(lastValue.getters, getter.result),
					setters: DArray.push(lastValue.setters, createObjectSetter(field, successType, context)),
				});
			},
		);
		if (DEither.isLeft(objectEntries)) {
			return objectEntries;
		}
		const setterType = GoAST.createFunctionType({
			arguments: [
				GoAST.createFunctionArgument({
					identifier: context.generateIdentifier(),
					type: GoAST.createPointerType({ typeReference: successType }),
				}),
				GoAST.createFunctionArgument({
					identifier: context.generateIdentifier(),
					type: GoAST.builtinTypeReferences.any,
				}),
			],
			returnTypes: [],
		});

		return context.success({
			before: objectEntries.before,
			result: GoAST.createCallExpression({
				callee: GoAST.createInstantiationExpression({
					target: GoAST.createSelectorExpression({
						target: context.registerSharedDependency(asyncGroupDependency.value),
						identifier: asyncGroupObjectIdentifier,
					}),
					typeArguments: DCommon.cast([successType]),
				}),
				arguments: [
					GoAST.createSliceLiteral({
						typeReference: GoAST.createSliceType({ elementType: getterType }),
						elements: objectEntries.getters,
					}),
					GoAST.createSliceLiteral({
						typeReference: GoAST.createSliceType({ elementType: setterType }),
						elements: objectEntries.setters,
					}),
					registerEitherTag(context, "right", "success"),
				],
			}),
		});
	}
	if (!DModeling.hasTagValue(successType, "[node][type]slice")) {
		return context.error(node, "async-group-success-must-contain-an-array-or-object");
	}
	let entriesBefore: readonly GoAST.Statement[] = [];
	let entries: GoAST.Expression | undefined = undefined;
	let entryType: GoType | undefined = undefined;
	let resolver: GoAST.FunctionLiteral | undefined = undefined;

	if (TsAST.isArrayLiteralExpression(group)) {
		const callbacks = await DGenerator.asyncReduce(
			group.elements,
			DGenerator.reduceFrom<{
				before: readonly GoAST.Statement[];
				values: readonly GoAST.Expression[];
			}>({
				before: [],
				values: [],
			}),
			async({ item, lastValue, next, exit }) => {
				if (TsAST.isSpreadElement(item)) {
					return exit(context.error(item, "async-group-spread-not-supported"));
				}
				const getterResult = await transformEntry(item, context);
				if (DEither.isLeft(getterResult)) {
					return exit(getterResult);
				}
				const getter = DEither.unwrapRight(getterResult);

				return next({
					before: DArray.concat(lastValue.before, getter.before),
					values: DArray.push(lastValue.values, getter.result),
				});
			},
		);
		if (DEither.isLeft(callbacks)) {
			return callbacks;
		}

		entriesBefore = callbacks.before;
		entries = GoAST.createSliceLiteral({
			typeReference: GoAST.createSliceType({ elementType: getterType }),
			elements: callbacks.values,
		});
		entryType = getterType;
		resolver = createResolver(entryType, true, context);
	} else {
		const goGroupType = await tsTypeOfNodeToGo(group, context);
		if (DEither.isLeft(goGroupType)) {
			return goGroupType;
		}
		const sliceType = DEither.unwrapRight(goGroupType);
		if (!DModeling.hasTagValue(sliceType, "[node][type]slice")) {
			return context.error(group, "async-group-object-form-not-supported-yet");
		}
		entryType = sliceType.elementType;
		const callsEntry = DModeling.hasTagValue(entryType, "[node][type]function");
		const isEither = GoPrinter.renderNode(entryType) === GoPrinter.renderNode(eitherAnyGoType(context));
		if (!callsEntry && !isEither) {
			const storedArray = await readStoredArrayLiteral(group, context);
			if (!storedArray) {
				return context.error(group, "async-group-mixed-entry-array-requires-a-local-literal");
			}
			const transformedGroupResult = await context.transform(group, expressionTransformers.value);
			if (DEither.isLeft(transformedGroupResult)) {
				return transformedGroupResult;
			}
			const transformedGroup = DEither.unwrapRight(transformedGroupResult);
			const getters = await DGenerator.asyncReduce(
				storedArray.elements,
				DGenerator.reduceFrom<readonly GoAST.Expression[]>([]),
				async({ item, index, lastValue, next, exit }) => {
					if (TsAST.isSpreadElement(item)) {
						return exit(context.error(item, "async-group-spread-not-supported"));
					}
					const getterResult = await createStoredEntryGetter(
						item,
						index,
						transformedGroup.result,
						context,
					);
					if (DEither.isLeft(getterResult)) {
						return exit(getterResult);
					}

					return next(DArray.push(lastValue, DEither.unwrapRight(getterResult).result));
				},
			);
			if (DEither.isLeft(getters)) {
				return getters;
			}
			entriesBefore = transformedGroup.before;
			entries = GoAST.createSliceLiteral({
				typeReference: GoAST.createSliceType({ elementType: getterType }),
				elements: getters,
			});
			entryType = getterType;
			resolver = createResolver(entryType, true, context);
		} else {
			const transformedGroupResult = await context.transform(group, expressionTransformers.value);
			if (DEither.isLeft(transformedGroupResult)) {
				return transformedGroupResult;
			}
			const transformedGroup = DEither.unwrapRight(transformedGroupResult);
			entriesBefore = transformedGroup.before;
			entries = transformedGroup.result;
			resolver = createResolver(entryType, callsEntry, context);
		}
	}
	if (!entries || !entryType || !resolver) {
		return context.error(group, "async-group-could-not-resolve-entries");
	}

	return context.success({
		before: entriesBefore,
		result: GoAST.createCallExpression({
			callee: GoAST.createInstantiationExpression({
				target: GoAST.createSelectorExpression({
					target: context.registerSharedDependency(asyncGroupDependency.value),
					identifier: asyncGroupIdentifier,
				}),
				typeArguments: DCommon.cast([entryType, successType.elementType]),
			}),
			arguments: [
				entries,
				resolver,
				registerEitherTag(context, "right", "success"),
			],
		}),
	});
}
