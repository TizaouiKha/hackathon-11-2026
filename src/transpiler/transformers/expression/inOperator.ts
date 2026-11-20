import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import { SymbolFlags } from "typescript/async";
import type { BuildContext } from "../../context/build";
import { go } from "../shared/goBuilder";
import { knownUnionMembers } from "../type/unionMembers";
import { expressionTransformers } from ".";

/**
 * `"barks" in animal` sur une union d'objets connus (D-27, partie 2).
 *
 * Chaque membre est rangé sous son type Go exact (partie 1) : savoir s'il a le
 * champ se décide **à la compilation**, membre par membre. Il reste à savoir,
 * à l'exécution, quel membre est dans la boîte :
 * ```go
 * func(value any) bool {
 *     switch value.(type) {
 *     case Dog: return true
 *     }
 *     return false
 * }(animal)
 * ```
 * Refusé : un champ facultatif (JS distingue « absent » et « présent mais
 * undefined », Go non), une clé qui n'est pas un littéral, un objet qui n'est
 * pas une union de types connus.
 */
export async function transformInOperator(node: TsAST.BinaryExpression, context: BuildContext) {
	if (!TsAST.isStringLiteral(node.left)) {
		return context.error(node.left, "in-key-must-be-a-string-literal");
	}

	const name = node.left.text;
	const { typeChecker } = context.transpilation;
	const members = await knownUnionMembers(await typeChecker.getTypeAtLocation(node.right), node.right, context);

	if (!members || !members.every((member) => member.rendered.startsWith("struct"))) {
		return context.error(node, "in-supports-only-unions-of-known-objects");
	}

	const cases: GoAST.TypeSwitchCase[] = [];

	for (const member of members) {
		const property = (await typeChecker.getPropertiesOfType(member.types[0]!))
			.find((candidate) => candidate.name === name);

		if (property && (property.flags & SymbolFlags.Optional) !== 0) {
			return context.error(node, "in-with-optional-property-not-supported-yet");
		}

		if (property) {
			cases.push(GoAST.createTypeSwitchCase({
				types: DCommon.cast([member.goType]),
				statements: [go.return(go.bool(true))],
			}));
		}
	}

	const target = await context.transformPrepared(node.right, expressionTransformers.value);

	if (DEither.isLeft(target)) {
		return target;
	}

	const body: GoAST.Statement[] = cases.length > 0
		? [
			GoAST.createTypeSwitchStatementWithoutDefault({
				expression: go.id("value"),
				cases: DCommon.cast(cases),
			}),
		]
		: [];

	return context.success({
		before: target.before,
		result: go.call(
			GoAST.createFunctionLiteral({
				arguments: [go.parameter("value", go.types.any)],
				returnTypes: [go.types.bool],
				body: go.block([...body, go.return(go.bool(false))]),
			}),
			[target.operand],
		),
	});
}
