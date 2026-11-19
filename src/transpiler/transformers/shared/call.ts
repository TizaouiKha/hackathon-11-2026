import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { expressionTransformers } from "../expression";
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";
import * as DGenerator from "@duplojs/lang/generator";
import { sequenceOperands, type SequencedOperand } from "./sequence";

export const callExpressionTransformer: Transformer<GoAST.CallExpression> = createTransformer(
	async(rawNode, context) => {
		const node = TsAST.isExpressionStatement(rawNode)
			? rawNode.expression
			: rawNode;
		if (!TsAST.isCallExpression(node)) {
			return context.notSupport();
		}

		const callee = await context.transformPrepared(node.expression, expressionTransformers.value);
		if (DEither.isLeft(callee)) {
			return callee;
		}

		// L'appelé puis chaque argument, dans l'ordre de JavaScript (R-01, n° 2).
		const preparedArguments = await DGenerator.asyncReduce(
			node.arguments,
			DGenerator.reduceFrom<readonly SequencedOperand[]>([
				{
					node: node.expression,
					...callee,
				},
			]),
			async({ item, lastValue, next, exit }) => {
				const argument = await context.transformPrepared(item, expressionTransformers.value);
				if (DEither.isLeft(argument)) {
					return exit(argument);
				}

				return next(DArray.push(lastValue, {
					node: item,
					...argument,
				}));
			},
		);

		if (DEither.isLeft(preparedArguments)) {
			return preparedArguments;
		}

		const { before, operands: [calleeOperand, ...argumentOperands] } = await sequenceOperands(
			preparedArguments,
			context,
		);

		return context.success({
			before,
			result: GoAST.createCallExpression({
				callee: calleeOperand!,
				arguments: argumentOperands,
			}),
		});
	},
);
