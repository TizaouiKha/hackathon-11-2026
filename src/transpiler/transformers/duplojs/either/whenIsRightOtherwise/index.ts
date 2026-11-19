import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { analyzeEitherOfType, eitherAnyGoType, transformTsType } from "../core/analysis";
import { inferParameter, transformCallback } from "../core/callback";
import { translateCurried, translateWithData, type EitherOperation } from "../core/operand";
import { whenIsRightOtherwiseDependency, whenIsRightOtherwiseIdentifier } from "./sharedDependency";

/**
 * Traduction de `whenIsRightOtherwise` pour une entrée donnée :
 * `shard_dependencies.WhenIsRightOtherwise(result, onRight, otherwise)`.
 */
function whenIsRightOtherwiseOperation(
	onRight: TsAST.Expression,
	otherwise: TsAST.Expression,
	context: BuildContext,
): EitherOperation {
	return async(operand, outputType) => {
		const shape = await DCommon.asyncPipe(
			analyzeEitherOfType(operand.type, operand.node, context),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(shape)) {
			return shape;
		}

		const outputGoType = await DCommon.asyncPipe(
			transformTsType(outputType, operand.node, context),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(outputGoType)) {
			return outputGoType;
		}

		const onRightExpression = await DCommon.asyncPipe(
			transformCallback(
				{
					node: onRight,
					parameterTypes: [inferParameter],
					returnType: outputGoType,
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
					parameterTypes: [eitherAnyGoType(context)],
					returnType: outputGoType,
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
				operand.before,
				onRightExpression.before,
				otherwiseExpression.before,
			),
			result: GoAST.createCallExpression({
				callee: GoAST.createSelectorExpression({
					target: packageName,
					identifier: whenIsRightOtherwiseIdentifier,
				}),
				arguments: [
					operand.expression,
					onRightExpression.result,
					otherwiseExpression.result,
				],
			}),
		});
	};
}

/**
 * `DEither.whenIsRightOtherwise(result, onRight, otherwise)` (avec données) ou
 * `DEither.whenIsRightOtherwise(onRight, otherwise)` (curryfiée : devient une fonction Go).
 */
export async function whenIsRightOtherwiseExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node)) {
		return context.error(node, "when-is-right-otherwise-must-be-called");
	}

	if (node.arguments.length === 3) {
		const [, onRight, otherwise] = node.arguments as unknown as [
			TsAST.Expression,
			TsAST.Expression,
			TsAST.Expression,
		];

		return translateWithData(node, whenIsRightOtherwiseOperation(onRight, otherwise, context), context);
	}

	if (node.arguments.length === 2) {
		const [onRight, otherwise] = node.arguments as unknown as [TsAST.Expression, TsAST.Expression];

		return translateCurried(node, whenIsRightOtherwiseOperation(onRight, otherwise, context), context);
	}

	return context.error(node, "when-is-right-otherwise-expects-two-or-three-arguments");
}
