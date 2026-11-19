import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { analyzeEitherOfType, sideValueGoType } from "../core/analysis";
import { registerEitherTag } from "../core/tag";
import { groupDependency, groupIdentifier } from "./sharedDependency";

/** `DEither.group(results)` -> `shard_dependencies.Group[T](results)`. */
export async function groupExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node) || node.arguments.length !== 1) {
		return context.error(node, "group-expects-one-argument");
	}

	const input = DArray.first(node.arguments);
	if (!input) {
		return context.error(node, "group-expects-one-argument");
	}

	const inputType = await context.transpilation.typeChecker.getTypeAtLocation(input);
	if (
		!(await context.transpilation.typeChecker.isArrayType(inputType))
		|| !inputType.isTypeReference()
	) {
		return context.error(input, "group-expects-an-array");
	}

	const elementType = DArray.first(
		await context.transpilation.typeChecker.getTypeArguments(inputType),
	);
	if (!elementType) {
		return context.error(input, "group-array-without-element-type");
	}

	const shape = await DCommon.asyncPipe(
		analyzeEitherOfType(elementType, input, context),
		DEither.unwrapRight,
	);
	if (DEither.isLeft(shape)) {
		return shape;
	}

	const valueType = await DCommon.asyncPipe(
		sideValueGoType(shape, "right", input, context),
		DEither.unwrapRight,
	);
	if (DEither.isLeft(valueType)) {
		return valueType;
	}

	const translated = await DCommon.asyncPipe(
		context.transform(input, expressionTransformers.value),
		DEither.unwrapRight,
	);
	if (DEither.isLeft(translated)) {
		return translated;
	}

	const packageName = context.registerSharedDependency(groupDependency.value);
	registerEitherTag(context, "right", "success");

	return context.success({
		before: translated.before,
		result: GoAST.createCallExpression({
			callee: GoAST.createInstantiationExpression({
				target: GoAST.createSelectorExpression({
					target: packageName,
					identifier: groupIdentifier,
				}),
				typeArguments: DCommon.cast([valueType]),
			}),
			arguments: [translated.result],
		}),
	});
}
