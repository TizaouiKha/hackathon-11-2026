import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { tsTypeOfNodeToGo } from "../type";
import { expressionTransformers } from ".";
import { transformTruthiness } from "./javascriptTruthiness";

export const conditionalExpressionTransformer: Transformer<GoAST.Identifier> = createTransformer(
	async(node, context) => {
		if (!TsAST.isConditionalExpression(node)) {
			return context.notSupport();
		}

		const condition = await transformTruthiness(node.condition, context);
		if (DEither.isLeft(condition)) {
			return condition;
		}

		const whenTrue = DEither.unwrapRight(await context.transform(node.whenTrue, expressionTransformers.value));
		if (DEither.isLeft(whenTrue)) {
			return whenTrue;
		}

		const whenFalse = DEither.unwrapRight(await context.transform(node.whenFalse, expressionTransformers.value));
		if (DEither.isLeft(whenFalse)) {
			return whenFalse;
		}

		const resultType = await tsTypeOfNodeToGo(node, context);
		if (DEither.isLeft(resultType)) {
			return resultType;
		}

		const result = context.generateIdentifier();
		const assign = (value: GoAST.Expression) => GoAST.createAssignmentStatement({
			targets: DCommon.cast([result]),
			values: DCommon.cast([value]),
		});

		return context.success({
			before: DArray.concat(
				condition.before,
				[
					GoAST.createVariableDeclarationZeroValue({
						identifier: result,
						typeReference: DEither.unwrapRight(resultType),
					}),
				],
				[
					GoAST.createIfStatement({
						condition: condition.condition,
						body: GoAST.createBlockStatement({
							statements: DArray.concat(whenTrue.before, [assign(whenTrue.result)]),
						}),
						elseBranch: GoAST.createBlockStatement({
							statements: DArray.concat(whenFalse.before, [assign(whenFalse.result)]),
						}),
					}),
				],
			),
			result,
		});
	},
);
