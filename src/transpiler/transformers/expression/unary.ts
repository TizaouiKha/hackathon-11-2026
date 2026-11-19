import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";

const unaryOperators: Partial<Record<TsAST.SyntaxKind, GoAST.UnaryOperator>> = {
	[TsAST.SyntaxKind.PlusToken]: "+",
	[TsAST.SyntaxKind.MinusToken]: "-",
	[TsAST.SyntaxKind.ExclamationToken]: "!",
	[TsAST.SyntaxKind.TildeToken]: "^",
};

export const unaryExpressionTransformer: Transformer<GoAST.UnaryExpression> = createTransformer(
	async(node, context) => {
		if (!TsAST.isPrefixUnaryExpression(node)) {
			return context.notSupport();
		}

		const operator = unaryOperators[node.operator];
		if (!operator) {
			return context.error(node, "unsupported-unary-operator");
		}

		const operand = await context.transformPrepared(node.operand, expressionTransformers.value);
		if (DEither.isLeft(operand)) {
			return operand;
		}

		return context.success({
			before: operand.before,
			result: GoAST.createUnaryExpression({
				operator,
				operand: operand.operand,
			}),
		});
	},
);
