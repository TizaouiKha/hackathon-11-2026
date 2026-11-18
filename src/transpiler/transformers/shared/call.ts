import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { expressionTransformers } from "../expression";
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";
import * as DGenerator from "@duplojs/lang/generator";

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

		// Chaque préparation est ajoutée avant de passer à l'argument suivant.
		const preparedArguments = await DGenerator.asyncReduce(
			node.arguments,
			DGenerator.reduceFrom<{
				before: readonly GoAST.Statement[];
				operands: readonly GoAST.Expression[];
			}>({
				before: callee.before,
				operands: [],
			}),
			async({ item, lastValue, next, exit }) => {
				const argument = await context.transformPrepared(item, expressionTransformers.value);
				if (DEither.isLeft(argument)) {
					return exit(argument);
				}

				return next({
					before: DArray.concat(lastValue.before, argument.before),
					operands: DArray.push(lastValue.operands, argument.operand),
				});
			},
		);

		if (DEither.isLeft(preparedArguments)) {
			return preparedArguments;
		}

		return context.success({
			before: preparedArguments.before,
			result: GoAST.createCallExpression({
				callee: callee.operand,
				arguments: preparedArguments.operands,
			}),
		});
	},
);
