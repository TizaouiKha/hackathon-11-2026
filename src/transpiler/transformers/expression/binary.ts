import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { expressionTransformers } from ".";
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";

const binaryOperators: Partial<
	Record<TsAST.SyntaxKind, GoAST.BinaryOperator>
> = {
	[TsAST.SyntaxKind.PlusToken]: "+",
	[TsAST.SyntaxKind.MinusToken]: "-",
	[TsAST.SyntaxKind.AsteriskToken]: "*",
	[TsAST.SyntaxKind.SlashToken]: "/",
	[TsAST.SyntaxKind.PercentToken]: "%",

	[TsAST.SyntaxKind.AmpersandToken]: "&",
	[TsAST.SyntaxKind.BarToken]: "|",
	[TsAST.SyntaxKind.CaretToken]: "^",
	[TsAST.SyntaxKind.LessThanLessThanToken]: "<<",
	[TsAST.SyntaxKind.GreaterThanGreaterThanToken]: ">>",

	[TsAST.SyntaxKind.AmpersandAmpersandToken]: "&&",
	[TsAST.SyntaxKind.BarBarToken]: "||",

	[TsAST.SyntaxKind.EqualsEqualsEqualsToken]: "==",
	[TsAST.SyntaxKind.ExclamationEqualsEqualsToken]: "!=",
	[TsAST.SyntaxKind.LessThanToken]: "<",
	[TsAST.SyntaxKind.LessThanEqualsToken]: "<=",
	[TsAST.SyntaxKind.GreaterThanToken]: ">",
	[TsAST.SyntaxKind.GreaterThanEqualsToken]: ">=",
};

function needsRuntimeArithmetic(node: TsAST.BinaryExpression, operator: GoAST.BinaryOperator) {
	if (!TsAST.isNumericLiteral(node.right)) {
		return false;
	}

	// Go interdit la division par une constante nulle et les constantes infinies.
	const right = Number(node.right.text);
	if (operator === "/" && right === 0) {
		return true;
	}

	if (!TsAST.isNumericLiteral(node.left)) {
		return false;
	}

	const left = Number(node.left.text);
	switch (operator) {
		case "+":
			return !Number.isFinite(left + right);
		case "*":
			return !Number.isFinite(left * right);
		case "/":
			return !Number.isFinite(left / right);
		default:
			return false;
	}
}

export const binaryExpressionTransformer: Transformer<GoAST.BinaryExpression> = createTransformer(
	async(node, context) => {
		if (!TsAST.isBinaryExpression(node)) {
			return context.notSupport();
		}

		const operator = binaryOperators[node.operatorToken.kind];
		if (!operator) {
			return context.notSupport();
		}

		const left = await context.transformPrepared(node.left, expressionTransformers.value);
		if (DEither.isLeft(left)) {
			return left;
		}

		const right = await context.transformPrepared(
			node.right,
			expressionTransformers.value,
			needsRuntimeArithmetic(node, operator),
		);
		if (DEither.isLeft(right)) {
			return right;
		}

		if ((operator === "&&" || operator === "||") && right.before.length > 0) {
			// Go n'appelle cette fonction que si l'opérateur doit évaluer le membre droit.
			return context.success({
				before: left.before,
				result: GoAST.createBinaryExpression({
					operator,
					left: left.operand,
					right: GoAST.createCallExpression({
						callee: GoAST.createFunctionLiteral({
							arguments: [],
							returnTypes: [GoAST.builtinTypeReferences.bool],
							body: GoAST.createBlockStatement({
								statements: DArray.push(
									right.before,
									GoAST.createReturnStatement({ values: [right.operand] }),
								),
							}),
						}),
						arguments: [],
					}),
				}),
			});
		}

		return context.success({
			before: DArray.concat(left.before, right.before),
			result: GoAST.createBinaryExpression({
				operator,
				left: left.operand,
				right: right.operand,
			}),
		});
	},
);
