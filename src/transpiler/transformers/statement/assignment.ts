import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import type { BuildContext } from "../../context/build";
import { expressionTransformers } from "../expression";
import { go } from "../shared/goBuilder";

/**
 * Affectations utilisées comme instructions (D-19) :
 * | TypeScript | Go |
 * |---|---|
 * | `x = e` | `x = e` |
 * | `x += e`, `-=`, `*=`, `/=` | idem (`+=` marche aussi pour les chaînes) |
 * | `x++`, `++x`, `x--`, `--x` | `x += 1`, `x -= 1` |
 * | `values[i] = e` | `values[int(i)] = e` (une slice partage sa mémoire, comme un tableau JS) |
 *
 * Refusés : `obj.champ = e` (un struct Go est **copié**, alors qu'un objet JS est
 * partagé : la modification serait perdue), `%=` et les opérateurs logiques
 * (`??=`, `||=`), une affectation utilisée comme **valeur** (`f(x = 1)`).
 */

type Built = Awaited<ReturnType<Transformer<GoAST.Statement>["transformer"]>>;

const compoundOperators: Readonly<Partial<Record<TsAST.SyntaxKind, GoAST.CompoundAssignmentStatement["operator"]>>> = {
	[TsAST.SyntaxKind.PlusEqualsToken]: "+=",
	[TsAST.SyntaxKind.MinusEqualsToken]: "-=",
	[TsAST.SyntaxKind.AsteriskEqualsToken]: "*=",
	[TsAST.SyntaxKind.SlashEqualsToken]: "/=",
};

/** Cible d'une affectation : une variable, ou un élément de tableau. */
async function transformTarget(node: TsAST.Expression, context: BuildContext) {
	if (TsAST.isIdentifier(node)) {
		return DEither.success({
			before: [] as readonly GoAST.Statement[],
			target: context.createSourceIdentifier(node.text) as GoAST.Expression,
		});
	}

	if (TsAST.isElementAccessExpression(node)) {
		const { typeChecker } = context.transpilation;
		const targetType = await typeChecker.getTypeAtLocation(node.expression);
		const isArray = await typeChecker.isArrayType(targetType) || await typeChecker.isTupleType(targetType);

		if (!isArray) {
			return context.error(node, "assignment-target-not-supported-yet");
		}

		const array = await DCommon.asyncPipe(
			context.transform(node.expression, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(array)) {
			return array;
		}

		const index = await DCommon.asyncPipe(
			context.transform(node.argumentExpression, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(index)) {
			return index;
		}

		return DEither.success({
			before: [...array.before, ...index.before] as readonly GoAST.Statement[],
			target: go.index(array.result, go.convert(go.types.int, index.result)) as GoAST.Expression,
		});
	}

	if (TsAST.isPropertyAccessExpression(node)) {
		return context.error(node, "object-mutation-not-supported-yet");
	}

	return context.error(node, "assignment-target-not-supported-yet");
}

/**
 * Traduit une affectation sans la placer : réutilisée pour la partie
 * « incrément » d'un `for (…; …; i++)`.
 */
export async function transformAssignment(node: TsAST.Expression, context: BuildContext) {
	if (
		(TsAST.isPostfixUnaryExpression(node) || TsAST.isPrefixUnaryExpression(node))
		&& (node.operator === TsAST.SyntaxKind.PlusPlusToken || node.operator === TsAST.SyntaxKind.MinusMinusToken)
	) {
		const target = await DCommon.asyncPipe(transformTarget(node.operand, context), DEither.unwrapRight);

		if (DEither.isLeft(target)) {
			return target;
		}

		return DEither.success({
			before: target.before,
			statement: GoAST.createCompoundAssignmentStatement({
				operator: node.operator === TsAST.SyntaxKind.PlusPlusToken ? "+=" : "-=",
				target: target.target as GoAST.CompoundAssignmentStatement["target"],
				value: go.int(1),
			}) as GoAST.SimpleStatement,
		});
	}

	if (!TsAST.isBinaryExpression(node)) {
		return DEither.left("not-an-assignment");
	}

	const operator = node.operatorToken.kind;
	const compound = compoundOperators[operator];

	if (operator !== TsAST.SyntaxKind.EqualsToken && !compound) {
		return operator >= TsAST.SyntaxKind.FirstAssignment && operator <= TsAST.SyntaxKind.LastAssignment
			? context.error(node, "assignment-operator-not-supported-yet")
			: DEither.left("not-an-assignment");
	}

	const target = await DCommon.asyncPipe(transformTarget(node.left, context), DEither.unwrapRight);

	if (DEither.isLeft(target)) {
		return target;
	}

	const value = await DCommon.asyncPipe(
		context.transform(node.right, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(value)) {
		return value;
	}

	return DEither.success({
		before: [...target.before, ...value.before] as readonly GoAST.Statement[],
		statement: (compound
			? GoAST.createCompoundAssignmentStatement({
				operator: compound,
				target: target.target as GoAST.CompoundAssignmentStatement["target"],
				value: value.result,
			})
			: go.assign([target.target], [value.result])) as GoAST.SimpleStatement,
	});
}

export const assignmentStatementTransformer: Transformer<GoAST.Statement> = createTransformer(
	async(node, context): Promise<Built> => {
		if (!TsAST.isExpressionStatement(node)) {
			return context.notSupport();
		}

		const assignment = await transformAssignment(node.expression, context);

		if (DEither.hasInformation(assignment, "not-an-assignment")) {
			return context.notSupport();
		}

		if (DEither.isLeft(assignment)) {
			return assignment;
		}

		const { before, statement } = DEither.unwrapRight(assignment);

		return context.success({
			before,
			result: statement,
		});
	},
);
