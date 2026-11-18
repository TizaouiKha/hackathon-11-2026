import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { analyzeEitherOfNode, transformTypeOfNode } from "../core/analysis";
import { transformCallback } from "../core/callback";
import { whenIsRightOtherwise2Identifier, whenIsRightOtherwiseDependency, whenIsRightOtherwiseIdentifier } from "./sharedDependency";

/**
 * `DEither.whenIsRightOtherwise(result, onRight, otherwise)`
 * -> `shard_dependencies.WhenIsRightOtherwise(result, onRight, otherwise)`
 * (ou `WhenIsRightOtherwise2` pour un `Either2`).
 * La forme sans donnée (dans un `pipe`) est traduite par l'étape 8.
 */
export async function whenIsRightOtherwiseExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node) || node.arguments.length !== 3) {
		return context.error(node, "when-is-right-otherwise-expects-three-arguments");
	}

	const [input, onRight, otherwise] = node.arguments as unknown as [
		TsAST.Expression,
		TsAST.Expression,
		TsAST.Expression,
	];

	const shape = await DCommon.asyncPipe(analyzeEitherOfNode(input, context), DEither.unwrapRight);

	if (DEither.isLeft(shape)) {
		return shape;
	}

	const outputType = await DCommon.asyncPipe(transformTypeOfNode(node, context), DEither.unwrapRight);

	if (DEither.isLeft(outputType)) {
		return outputType;
	}

	const inputExpression = await DCommon.asyncPipe(
		context.transform(input, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(inputExpression)) {
		return inputExpression;
	}

	const onRightExpression = await DCommon.asyncPipe(
		transformCallback(
			{
				node: onRight,
				parameterTypes: [shape.rightValueType],
				returnType: outputType,
			},
			context,
		),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(onRightExpression)) {
		return onRightExpression;
	}

	const otherwiseExpression = await DCommon.asyncPipe(
		transformCallback(
			{
				node: otherwise,
				parameterTypes: [shape.goType],
				returnType: outputType,
			},
			context,
		),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(otherwiseExpression)) {
		return otherwiseExpression;
	}

	const packageName = context.registerSharedDependency(whenIsRightOtherwiseDependency.value);

	return context.success({
		before: DArray.concat(
			inputExpression.before,
			onRightExpression.before,
			otherwiseExpression.before,
		),
		result: GoAST.createCallExpression({
			callee: GoAST.createSelectorExpression({
				target: packageName,
				identifier: shape.kind === "either"
					? whenIsRightOtherwiseIdentifier
					: whenIsRightOtherwise2Identifier,
			}),
			arguments: [
				inputExpression.result,
				onRightExpression.result,
				otherwiseExpression.result,
			],
		}),
	});
}
