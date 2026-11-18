import { type Transformer } from "@transformer";
import { GoAST, GoPrinter } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DGenerator from "@duplojs/lang/generator";
import { SignatureKind } from "typescript/async";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { analyzeEitherOfNode, transformTsType } from "../core/analysis";
import { transformCallback } from "../core/callback";
import { rightThenDependency, rightThenIdentifier } from "./sharedDependency";

async function stepReturnTypeKey(step: TsAST.Expression, context: BuildContext) {
	const { typeChecker } = context.transpilation;
	const signature = DArray.first(
		await typeChecker.getSignaturesOfType(
			await typeChecker.getTypeAtLocation(step),
			SignatureKind.Call,
		),
	);

	if (!signature) {
		return context.error(step, "right-pipe-step-without-call-signature");
	}

	return DEither.rightPipe(
		await transformTsType(await signature.getReturnType(), step, context),
		(goType) => DEither.success(GoPrinter.renderNode(goType)),
	);
}

/**
 * `DEither.rightPipe(r, f, g)` -> `RightThen(RightThen(r, f), g)`.
 * Limite (D-09.3) : chaque étape doit renvoyer le même type Go que l'entrée
 * (`Either[float64]` dans les exercices). Une étape qui renvoie une valeur brute
 * ou un autre type d'Either est refusée explicitement.
 */
export async function rightPipeExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node) || node.arguments.length < 2) {
		return context.error(node, "right-pipe-expects-an-input-and-steps");
	}

	const [input, ...steps] = node.arguments as unknown as [TsAST.Expression, ...TsAST.Expression[]];

	const shape = await DCommon.asyncPipe(analyzeEitherOfNode(input, context), DEither.unwrapRight);

	if (DEither.isLeft(shape)) {
		return shape;
	}

	if (shape.kind !== "either") {
		return context.error(input, "right-pipe-on-either2-not-supported");
	}

	const inputKey = GoPrinter.renderNode(shape.goType);

	const inputExpression = await DCommon.asyncPipe(
		context.transform(input, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(inputExpression)) {
		return inputExpression;
	}

	const packageName = context.registerSharedDependency(rightThenDependency.value);

	const piped = await DCommon.asyncPipe(
		steps,
		DGenerator.asyncReduce(
			DGenerator.reduceFrom<{
				before: readonly GoAST.Statement[];
				result: GoAST.Expression;
			}>({
				before: inputExpression.before,
				result: inputExpression.result,
			}),
			async({ item, lastValue, next, exit }) => {
				const stepKey = await DCommon.asyncPipe(stepReturnTypeKey(item, context), DEither.unwrapRight);

				if (DEither.isLeft(stepKey)) {
					return exit(stepKey);
				}

				if (stepKey !== inputKey) {
					return exit(context.error(item, "right-pipe-step-must-return-the-input-either-type"));
				}

				const step = await DCommon.asyncPipe(
					transformCallback(
						{
							node: item,
							parameterTypes: [shape.rightValueType],
							returnType: shape.goType,
						},
						context,
					),
					DEither.unwrapRight,
				);

				if (DEither.isLeft(step)) {
					return exit(step);
				}

				return next({
					before: DArray.concat(lastValue.before, step.before),
					result: GoAST.createCallExpression({
						callee: GoAST.createSelectorExpression({
							target: packageName,
							identifier: rightThenIdentifier,
						}),
						arguments: [lastValue.result, step.result],
					}),
				});
			},
		),
	);

	if (DEither.isLeft(piped)) {
		return piped;
	}

	return context.success(piped);
}
