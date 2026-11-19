import * as DEither from "@duplojs/lang/either";
import { type GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";

export const parenthesizedExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		if (!TsAST.isParenthesizedExpression(node)) {
			return context.notSupport();
		}

		const expression = DEither.unwrapRight(
			await context.transform(node.expression, expressionTransformers.value),
		);
		return DEither.isLeft(expression)
			? expression
			: context.success(expression);
	},
);
