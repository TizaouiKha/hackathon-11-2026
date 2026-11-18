import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { expressionTransformers } from ".";
import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";
import { TypeFlags, type Type } from "typescript/async";
import { type BuildContext } from "../../context/build";
import {
	bitwiseHelperIdentifiers,
	javascriptBitwiseDependency,
	mathImportDeclaration,
	type BitwiseOperation,
} from "./javascriptNumber";

/** Opérateurs que Go applique directement à des `float64`. */
const binaryOperators: Partial<
	Record<TsAST.SyntaxKind, GoAST.BinaryOperator>
> = {
	[TsAST.SyntaxKind.PlusToken]: "+",
	[TsAST.SyntaxKind.MinusToken]: "-",
	[TsAST.SyntaxKind.AsteriskToken]: "*",
	[TsAST.SyntaxKind.SlashToken]: "/",

	[TsAST.SyntaxKind.AmpersandAmpersandToken]: "&&",
	[TsAST.SyntaxKind.BarBarToken]: "||",

	[TsAST.SyntaxKind.EqualsEqualsEqualsToken]: "==",
	[TsAST.SyntaxKind.ExclamationEqualsEqualsToken]: "!=",
	[TsAST.SyntaxKind.LessThanToken]: "<",
	[TsAST.SyntaxKind.LessThanEqualsToken]: "<=",
	[TsAST.SyntaxKind.GreaterThanToken]: ">",
	[TsAST.SyntaxKind.GreaterThanEqualsToken]: ">=",
};

/**
 * Opérateurs sur les bits : JavaScript convertit les opérandes en entiers
 * 32 bits, Go refuse ces opérateurs sur des `float64` -> helpers partagés.
 */
const bitwiseOperators: Partial<Record<TsAST.SyntaxKind, BitwiseOperation>> = {
	[TsAST.SyntaxKind.AmpersandToken]: "and",
	[TsAST.SyntaxKind.BarToken]: "or",
	[TsAST.SyntaxKind.CaretToken]: "xor",
	[TsAST.SyntaxKind.LessThanLessThanToken]: "leftShift",
	[TsAST.SyntaxKind.GreaterThanGreaterThanToken]: "signedRightShift",
	[TsAST.SyntaxKind.GreaterThanGreaterThanGreaterThanToken]: "unsignedRightShift",
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

function isTypeLike(type: Type, flags: TypeFlags) {
	return (type.flags & flags) !== 0;
}

/** Fonction Go appelée immédiatement : `func() T { …statements }()`. */
function immediateFunction(returnType: GoAST.BuiltinTypeReference, statements: readonly GoAST.Statement[]) {
	return GoAST.createCallExpression({
		callee: GoAST.createFunctionLiteral({
			arguments: [],
			returnTypes: [returnType],
			body: GoAST.createBlockStatement({ statements }),
		}),
		arguments: [],
	});
}

/**
 * `&&` / `||` entre **nombres** : JavaScript renvoie la valeur d'un des opérandes,
 * selon que le gauche est « truthy » (ni `0`, ni `-0`, ni `NaN`).
 * ```go
 * // a || b
 * func() float64 { if a == a && a != 0 { return a }; …préparation de b; return b }()
 * // a && b
 * func() float64 { if a != a || a == 0 { return a }; …préparation de b; return b }()
 * ```
 * Le membre droit n'est évalué que si nécessaire, comme en JavaScript.
 */
interface PreparedOperand {
	before: readonly GoAST.Statement[];
	operand: GoAST.Expression;
}

function compare(
	left: GoAST.Expression,
	operator: GoAST.BinaryOperator,
	right: GoAST.Expression,
) {
	return GoAST.createBinaryExpression({
		left,
		operator,
		right,
	});
}

function numericLogical(
	operator: "&&" | "||",
	left: GoAST.Expression,
	right: PreparedOperand,
) {
	const zero = GoAST.createIntegerLiteral({ value: 0n });
	const keepLeft = operator === "||"
		? compare(compare(left, "==", left), "&&", compare(left, "!=", zero))
		: compare(compare(left, "!=", left), "||", compare(left, "==", zero));

	return immediateFunction(GoAST.builtinTypeReferences.float64, [
		GoAST.createIfStatement({
			condition: keepLeft,
			body: GoAST.createBlockStatement({
				statements: [GoAST.createReturnStatement({ values: [left] })],
			}),
		}),
		...right.before,
		GoAST.createReturnStatement({ values: [right.operand] }),
	]);
}

async function transformBitwise(
	node: TsAST.BinaryExpression,
	operation: BitwiseOperation,
	context: BuildContext,
) {
	const left = await context.transformPrepared(node.left, expressionTransformers.value);
	if (DEither.isLeft(left)) {
		return left;
	}

	const right = await context.transformPrepared(node.right, expressionTransformers.value);
	if (DEither.isLeft(right)) {
		return right;
	}

	return context.success({
		before: DArray.concat(left.before, right.before),
		result: GoAST.createCallExpression({
			callee: GoAST.createSelectorExpression({
				target: context.registerSharedDependency(javascriptBitwiseDependency.value),
				identifier: bitwiseHelperIdentifiers[operation],
			}),
			arguments: [left.operand, right.operand],
		}),
	});
}

/** `a % b` -> `math.Mod(a, b)` : même règle de signe et de NaN que JavaScript. */
async function transformModulo(node: TsAST.BinaryExpression, context: BuildContext) {
	const left = await context.transformPrepared(node.left, expressionTransformers.value);
	if (DEither.isLeft(left)) {
		return left;
	}

	const right = await context.transformPrepared(node.right, expressionTransformers.value);
	if (DEither.isLeft(right)) {
		return right;
	}

	context.file.imports.add(mathImportDeclaration.value);

	return context.success({
		before: DArray.concat(left.before, right.before),
		result: GoAST.createCallExpression({
			callee: GoAST.createSelectorExpression({
				target: GoAST.createIdentifier("math"),
				identifier: GoAST.createIdentifier("Mod"),
			}),
			arguments: [left.operand, right.operand],
		}),
	});
}

type BinaryResultNode = GoAST.BinaryExpression | GoAST.CallExpression;

export const binaryExpressionTransformer: Transformer<BinaryResultNode> = createTransformer(
	async(node, context) => {
		if (!TsAST.isBinaryExpression(node)) {
			return context.notSupport();
		}

		if (node.operatorToken.kind === TsAST.SyntaxKind.PercentToken) {
			return transformModulo(node, context);
		}

		const bitwiseOperation = bitwiseOperators[node.operatorToken.kind];
		if (bitwiseOperation) {
			return transformBitwise(node, bitwiseOperation, context);
		}

		const operator = binaryOperators[node.operatorToken.kind];
		if (!operator) {
			return context.notSupport();
		}

		const isLogical = operator === "&&" || operator === "||";
		const { typeChecker } = context.transpilation;
		const leftType = isLogical ? await typeChecker.getTypeAtLocation(node.left) : undefined;
		const rightType = isLogical ? await typeChecker.getTypeAtLocation(node.right) : undefined;
		const isNumericLogical = leftType !== undefined && rightType !== undefined
			&& isTypeLike(leftType, TypeFlags.NumberLike) && isTypeLike(rightType, TypeFlags.NumberLike);

		// Go n'a `&&` / `||` que sur des booléens. Entre nombres, on reproduit la
		// valeur renvoyée par JavaScript ; sinon (types mélangés), refus explicite.
		if (
			isLogical
			&& !isNumericLogical
			&& !(
				leftType && rightType
				&& isTypeLike(leftType, TypeFlags.BooleanLike) && isTypeLike(rightType, TypeFlags.BooleanLike)
			)
		) {
			return context.error(node, "logical-operator-supports-only-two-booleans-or-two-numbers");
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

		if (isNumericLogical) {
			return context.success({
				before: left.before,
				result: numericLogical(operator as "&&" | "||", left.operand, right),
			});
		}

		if (isLogical && right.before.length > 0) {
			// Go n'appelle cette fonction que si l'opérateur doit évaluer le membre droit.
			return context.success({
				before: left.before,
				result: GoAST.createBinaryExpression({
					operator,
					left: left.operand,
					right: immediateFunction(GoAST.builtinTypeReferences.bool, [
						...right.before,
						GoAST.createReturnStatement({ values: [right.operand] }),
					]),
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
