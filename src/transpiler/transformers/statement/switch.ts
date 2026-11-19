import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import type { BuildContext } from "../../context/build";
import { expressionTransformers } from "../expression";
import { statementTransformers } from ".";

/**
 * `switch` (D-19). Deux différences avec Go, traitées ici :
 * - JS **enchaîne** sur le `case` suivant faute de `break` ; Go s'arrête. Un
 *   `case` qui ne se termine pas par `break`, `return`, `continue` ou `throw`
 *   reçoit donc un `fallthrough` ;
 * - un `break` final est inutile en Go : il est retiré (un `break` placé
 *   ailleurs garde le même sens : il sort du `switch`).
 * Des `case` vides qui se suivent (`case "a": case "b": …`) deviennent un seul
 * `case "a", "b":`. La comparaison reste stricte (`===`) : Go compare des
 * valeurs du même type.
 * Refusé : `default` regroupé avec d'autres `case`.
 */

type Built = Awaited<ReturnType<Transformer<GoAST.Statement>["transformer"]>>;

interface ClauseGroup {
	readonly labels: readonly TsAST.Expression[];
	readonly isDefault: boolean;
	readonly statements: readonly TsAST.Statement[];
}

/** Regroupe `case a: case b: corps` en un seul groupe. */
function groupClauses(clauses: readonly TsAST.CaseOrDefaultClause[]) {
	const groups: ClauseGroup[] = [];
	let labels: TsAST.Expression[] = [];
	let isDefault = false;

	for (const clause of clauses) {
		if (TsAST.isDefaultClause(clause)) {
			isDefault = true;
		} else {
			labels.push(clause.expression);
		}

		if (clause.statements.length > 0) {
			groups.push({
				labels,
				isDefault,
				statements: clause.statements,
			});
			labels = [];
			isDefault = false;
		}
	}

	if (labels.length > 0 || isDefault) {
		groups.push({
			labels,
			isDefault,
			statements: [],
		});
	}

	return groups;
}

function endsTheClause(statement: TsAST.Statement | undefined) {
	return statement !== undefined && (
		TsAST.isBreakStatement(statement)
		|| TsAST.isReturnStatement(statement)
		|| TsAST.isContinueStatement(statement)
		|| TsAST.isThrowStatement(statement)
	);
}

async function transformStatements(statements: readonly TsAST.Statement[], context: BuildContext) {
	const result: GoAST.Statement[] = [];

	for (const statement of statements) {
		const transformed = await DCommon.asyncPipe(
			context.transform(statement, statementTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(transformed)) {
			return transformed;
		}

		result.push(...transformed.before, transformed.result);
	}

	return DEither.success<readonly GoAST.Statement[]>(result);
}

export const switchStatementTransformer: Transformer<GoAST.Statement> = createTransformer(
	async(node, context): Promise<Built> => {
		if (!TsAST.isSwitchStatement(node)) {
			return context.notSupport();
		}

		const subject = await DCommon.asyncPipe(
			context.transform(node.expression, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(subject)) {
			return subject;
		}

		const groups = groupClauses(node.caseBlock.clauses);
		const cases: GoAST.ExpressionSwitchCase[] = [];
		const casesAfterDefault: GoAST.ExpressionSwitchCase[] = [];
		let defaultCase: GoAST.DefaultCase | undefined = undefined;

		for (const [position, group] of groups.entries()) {
			if (group.isDefault && group.labels.length > 0) {
				return context.error(node, "switch-default-grouped-with-case-not-supported-yet");
			}

			const last = DArray.last(group.statements);
			const fallsThrough = !endsTheClause(last);

			// Le `break` final est implicite en Go.
			const kept = last && TsAST.isBreakStatement(last) && !last.label
				? group.statements.slice(0, -1)
				: group.statements;
			const body = await transformStatements(kept, context);

			if (DEither.isLeft(body)) {
				return body;
			}

			const statements = [
				...DEither.unwrapRight(body),
				// Dernier groupe : rien après, JS sort simplement du `switch`.
				...fallsThrough && position < groups.length - 1 ? [GoAST.createFallthroughStatement({})] : [],
			];

			if (group.isDefault) {
				defaultCase = GoAST.createDefaultCase({ statements });
				continue;
			}

			const labels: GoAST.Expression[] = [];

			for (const label of group.labels) {
				const transformed = await DCommon.asyncPipe(
					context.transform(label, expressionTransformers.value),
					DEither.unwrapRight,
				);

				if (DEither.isLeft(transformed)) {
					return transformed;
				}

				if (!DArray.lengthEqual(transformed.before, 0)) {
					return context.error(label, "switch-case-label-too-complex");
				}

				labels.push(transformed.result);
			}

			const switchCase = GoAST.createExpressionSwitchCase({
				expressions: labels as unknown as GoAST.ExpressionSwitchCase["expressions"],
				statements,
			});

			(defaultCase ? casesAfterDefault : cases).push(switchCase);
		}

		return context.success({
			before: subject.before,
			result: defaultCase
				? GoAST.createExpressionSwitchStatementWithDefault({
					expression: subject.result,
					casesBeforeDefault: cases,
					defaultCase,
					casesAfterDefault,
				})
				: GoAST.createExpressionSwitchStatementWithoutDefault({
					expression: subject.result,
					cases,
				}),
		});
	},
);
