import { type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { analyzeEitherOfNode } from "../core/analysis";
import { isRightCall } from "../core/goFunction";

/**
 * `DEither.isRight(result)` -> `result.Tag.IsRight()`.
 * Pas de helper : la méthode du tag suffit, pour `Either` comme pour `Either2`.
 */
export async function isRightExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	const input = TsAST.isCallExpression(node) ? DArray.first(node.arguments) : undefined;

	if (!TsAST.isCallExpression(node) || !input || node.arguments.length !== 1) {
		return context.error(node, "is-right-expects-one-argument");
	}

	// Garantit que l'argument est bien un Either (et enregistre ses tags).
	const shape = await DCommon.asyncPipe(analyzeEitherOfNode(input, context), DEither.unwrapRight);

	if (DEither.isLeft(shape)) {
		return shape;
	}

	const inputExpression = await DCommon.asyncPipe(
		context.transform(input, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(inputExpression)) {
		return inputExpression;
	}

	return context.success({
		before: inputExpression.before,
		result: isRightCall(inputExpression.result),
	});
}
