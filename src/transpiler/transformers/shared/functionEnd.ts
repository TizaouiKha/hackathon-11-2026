import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { TypeFlags, type Type } from "typescript/async";
import type { BuildContext } from "../../context/build";
import { undefinedShardDependency } from "../../sharedDependency/defaults";
import { go } from "./goBuilder";

/**
 * Fin d'une fonction qui renvoie une valeur (D-27, partie 2).
 *
 * Go exige que le corps se termine par une instruction « terminale » (un
 * `return`, un `panic`, un `if / else` dont les deux branches le sont…).
 * TypeScript, lui, sait des choses que Go ignore :
 * - après un `switch` qui couvre **tous** les cas d'une union, la fin est
 *   inatteignable : on ajoute `panic(…)`, que le programme ne rencontre jamais ;
 * - si le type de retour contient `undefined`, arriver au bout renvoie
 *   `undefined` en JS : on ajoute `return JSUndefined{}`.
 * Rien n'est ajouté quand le corps se termine déjà (sinon `go vet` signalerait
 * du code inatteignable).
 */

function endsWithTerminating(statements: readonly GoAST.Statement[]) {
	const last = statements.at(-1);

	return last !== undefined && isTerminating(last);
}

/** Une instruction `break` sans étiquette, hors boucle ou `switch` imbriqué. */
function containsBreak(statements: readonly GoAST.Statement[]): boolean {
	return statements.some((statement) => {
		if (DModeling.hasTagValue(statement, "[node][statement]break")) {
			return true;
		}

		if (DModeling.hasTagValue(statement, "[node][statement]block")) {
			return containsBreak((statement as GoAST.BlockStatement).statements);
		}

		if (DModeling.hasTagValue(statement, "[node][statement]if")) {
			const ifStatement = statement as GoAST.IfStatement;

			return containsBreak(ifStatement.body.statements)
				|| (ifStatement.elseBranch !== undefined && containsBreak([ifStatement.elseBranch]));
		}

		return false;
	});
}

type SwitchWithDefault = GoAST.ExpressionSwitchStatementWithDefault | GoAST.TypeSwitchStatementWithDefault;

/** Les règles de la spécification Go (« Terminating statements »). */
export function isTerminating(statement: GoAST.Statement): boolean {
	if (
		DModeling.hasTagValue(statement, "[node][statement]return")
		|| DModeling.hasTagValue(statement, "[node][statement]goto")
	) {
		return true;
	}

	if (DModeling.hasTagValue(statement, "[node][expression][statement]call")) {
		const { callee } = statement as GoAST.CallExpression;

		return DModeling.hasTagValue(callee, "[node]identifier") && (callee as GoAST.Identifier).value === "panic";
	}

	if (DModeling.hasTagValue(statement, "[node][statement]block")) {
		return endsWithTerminating((statement as GoAST.BlockStatement).statements);
	}

	if (DModeling.hasTagValue(statement, "[node][statement]if")) {
		const ifStatement = statement as GoAST.IfStatement;

		return ifStatement.elseBranch !== undefined
			&& endsWithTerminating(ifStatement.body.statements)
			&& isTerminating(ifStatement.elseBranch);
	}

	if (DModeling.hasTagValue(statement, "[node][statement]for")) {
		const forStatement = statement as GoAST.ForStatement;

		return forStatement.condition === undefined && !containsBreak(forStatement.body.statements);
	}

	if (
		DModeling.hasTagValue(statement, "[node][statement]switch-expression-with-default")
		|| DModeling.hasTagValue(statement, "[node][statement]switch-type-with-default")
	) {
		const switchStatement = statement as SwitchWithDefault;
		const clauses = [
			...switchStatement.casesBeforeDefault,
			switchStatement.defaultCase,
			...switchStatement.casesAfterDefault,
		];

		return clauses.every((clause) => endsWithTerminating(clause.statements) && !containsBreak(clause.statements));
	}

	return false;
}

async function includesUndefined(type: Type) {
	if ((type.flags & (TypeFlags.Undefined | TypeFlags.Void)) !== 0) {
		return true;
	}

	return type.isUnionType()
		&& ((await type.getTypes()) ?? []).some((member) => (member.flags & TypeFlags.Undefined) !== 0);
}

/** Les instructions du corps, complétées si Go ne voit pas de fin. */
export async function closeFunctionBody(
	statements: readonly GoAST.Statement[],
	tsReturnType: Type,
	context: BuildContext,
): Promise<readonly GoAST.Statement[]> {
	if (endsWithTerminating(statements)) {
		return statements;
	}

	if (await includesUndefined(tsReturnType)) {
		return [
			...statements,
			go.return(GoAST.createStructLiteral({
				typeReference: GoAST.createPackageTypeReference({
					packageName: context.registerSharedDependency(undefinedShardDependency.value),
					identifier: go.id("JSUndefined"),
				}),
				elements: [],
			})),
		];
	}

	return [
		...statements,
		go.call("panic", [go.string("inatteignable : TypeScript garantit que tous les cas sont traités")]) as unknown as GoAST.Statement,
	];
}
