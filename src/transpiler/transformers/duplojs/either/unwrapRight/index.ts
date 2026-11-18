import { sharedDependencyPackageName, type Transformer } from "@transformer";
import { GoAST, GoPrinter } from "@go";
import { TsAST } from "@typescript";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { transformTsType } from "../core/analysis";
import { readEitherIssues } from "../core/issues";
import { assertType, select } from "../core/goFunction";
import { translateFunctionValue, translateWithData, type EitherOperation } from "../core/operand";
import { eitherAnyTypeIdentifier, eitherFieldIdentifiers } from "../core/sharedDependency";
import { registerEitherTag, valueInformation } from "../core/tag";
import { unwrapRightDependency, unwrapRightIdentifier } from "./sharedDependency";

// Comparaison sans enregistrer de dépendance (un import Go inutilisé ne compile pas).
const renderedEitherAny = GoPrinter.renderNode(GoAST.createPackageTypeReference({
	packageName: sharedDependencyPackageName,
	identifier: eitherAnyTypeIdentifier,
}));

/**
 * `unwrapRight` d'après les types connus par TypeScript (D-18) :
 * - entrée sans Either : renvoyée telle quelle (comme DuploJS) ;
 * - résultat sans Either (que des issues right) : `input.Value.(T)` ;
 * - résultat `any` : `input.Value` ;
 * - résultat encore union d'Either (`number | Fail`) : helper `UnwrapRight`.
 */
function unwrapRightOperation(context: BuildContext): EitherOperation {
	return async(operand, outputType) => {
		const inputIssues = await readEitherIssues(operand.type, operand.node, context);

		if (DEither.isLeft(inputIssues)) {
			return DEither.hasInformation(inputIssues, "none")
				? context.success({
					before: operand.before,
					result: operand.expression,
				})
				: inputIssues;
		}

		const outputGoType = await DCommon.asyncPipe(
			transformTsType(outputType, operand.node, context),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(outputGoType)) {
			return outputGoType;
		}

		const rendered = GoPrinter.renderNode(outputGoType);
		const value = select(operand.expression, eitherFieldIdentifiers.value);

		if (rendered === renderedEitherAny) {
			registerEitherTag(context, "value", valueInformation);

			return context.success({
				before: operand.before,
				result: GoAST.createCallExpression({
					callee: GoAST.createSelectorExpression({
						target: context.registerSharedDependency(unwrapRightDependency.value),
						identifier: unwrapRightIdentifier,
					}),
					arguments: [operand.expression],
				}),
			});
		}

		return context.success({
			before: operand.before,
			result: rendered === GoPrinter.renderNode(GoAST.builtinTypeReferences.any)
				? value
				: assertType(value, outputGoType),
		});
	};
}

/**
 * `DEither.unwrapRight(result)` ou `DEither.unwrapRight` passé comme fonction
 * (étape de `pipe`) : la fonction Go est typée par le type attendu.
 */
export async function unwrapRightExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (TsAST.isCallExpression(node)) {
		return node.arguments.length === 1
			? translateWithData(node, unwrapRightOperation(context), context)
			: context.error(node, "unwrap-right-expects-one-argument");
	}

	const expectedType = TsAST.isExpression(node)
		? await context.transpilation.typeChecker.getContextualType(node)
		: undefined;

	if (!expectedType || !TsAST.isExpression(node)) {
		return context.error(node, "unwrap-right-as-value-needs-an-expected-type");
	}

	return translateFunctionValue(node, expectedType, unwrapRightOperation(context), context);
}
