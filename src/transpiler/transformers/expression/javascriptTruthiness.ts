import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import type { TsAST } from "@typescript";
import { TypeFlags } from "typescript/async";
import { type BuildContext } from "../../context/build";
import { expressionTransformers } from ".";

function has(typeFlags: TypeFlags, expected: TypeFlags) {
	return (typeFlags & expected) !== 0;
}

function compare(left: GoAST.Expression, operator: GoAST.BinaryOperator, right: GoAST.Expression) {
	return GoAST.createBinaryExpression({
		left,
		operator,
		right,
	});
}

/**
 * Convertit une condition TypeScript vers un booléen Go en conservant la
 * truthiness JavaScript. Les nombres sont faux pour `0`, `-0` et `NaN`.
 */
export async function transformTruthiness(
	node: TsAST.Expression,
	context: BuildContext,
	invert = false,
) {
	const tsType = await context.transpilation.typeChecker.getTypeAtLocation(node);
	const prepared = await context.transformPrepared(node, expressionTransformers.value);
	if (DEither.isLeft(prepared)) {
		return prepared;
	}

	if (has(tsType.flags, TypeFlags.BooleanLike)) {
		return {
			before: prepared.before,
			condition: invert
				? GoAST.createUnaryExpression({
					operator: "!",
					operand: prepared.operand,
				})
				: prepared.operand,
		};
	}

	if (has(tsType.flags, TypeFlags.NumberLike)) {
		const zero = GoAST.createIntegerLiteral({ value: 0n });
		return {
			before: prepared.before,
			condition: invert
				? compare(
					compare(prepared.operand, "!=", prepared.operand),
					"||",
					compare(prepared.operand, "==", zero),
				)
				: compare(
					compare(prepared.operand, "==", prepared.operand),
					"&&",
					compare(prepared.operand, "!=", zero),
				),
		};
	}

	return context.error(node, "truthiness-supports-only-booleans-and-numbers");
}
