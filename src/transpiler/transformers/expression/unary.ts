import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from ".";
import { bitwiseHelperIdentifiers, javascriptBitwiseDependency } from "./javascriptNumber";
import { transformTruthiness } from "./javascriptTruthiness";

const unaryOperators: Partial<Record<TsAST.SyntaxKind, GoAST.UnaryOperator>> = {
	[TsAST.SyntaxKind.PlusToken]: "+",
	[TsAST.SyntaxKind.MinusToken]: "-",
};

export const unaryExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		if (!TsAST.isPrefixUnaryExpression(node)) {
			return context.notSupport();
		}

		const operator = unaryOperators[node.operator];
		if (
			!operator
			&& node.operator !== TsAST.SyntaxKind.TildeToken
			&& node.operator !== TsAST.SyntaxKind.ExclamationToken
		) {
			return context.error(node, "unsupported-unary-operator");
		}
		if (node.operator === TsAST.SyntaxKind.ExclamationToken) {
			const truthiness = await transformTruthiness(node.operand, context, true);
			return DEither.isLeft(truthiness)
				? truthiness
				: context.success({
					before: truthiness.before,
					result: truthiness.condition,
				});
		}

		const operand = await context.transformPrepared(node.operand, expressionTransformers.value);
		if (DEither.isLeft(operand)) {
			return operand;
		}

		if (node.operator === TsAST.SyntaxKind.TildeToken) {
			return context.success({
				before: operand.before,
				result: GoAST.createCallExpression({
					callee: GoAST.createSelectorExpression({
						target: context.registerSharedDependency(javascriptBitwiseDependency.value),
						identifier: bitwiseHelperIdentifiers.xor,
					}),
					arguments: [
						operand.operand,
						GoAST.createConversionExpression({
							typeReference: GoAST.builtinTypeReferences.float64,
							operand: GoAST.createFloatLiteral({ value: "-1" }),
						}),
					],
				}),
			});
		}
		if (!operator) {
			return context.error(node, "unsupported-unary-operator");
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
