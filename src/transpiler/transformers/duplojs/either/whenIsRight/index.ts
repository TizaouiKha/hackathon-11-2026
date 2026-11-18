import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { SignatureKind } from "typescript/async";
import { type BuildContext } from "../../../../context/build";
import { analyzeEitherOfType, eitherAnyGoType } from "../core/analysis";
import { inferParameter, transformCallback } from "../core/callback";
import { readEitherIssues } from "../core/issues";
import { translateCurried, translateWithData, type EitherOperation } from "../core/operand";
import { registerEitherTag, valueInformation } from "../core/tag";
import { rightThenDependency, rightThenIdentifier } from "../rightPipe/sharedDependency";
import { whenIsRightDependency, whenIsRightIdentifier } from "./sharedDependency";

/** Le callback renvoie-t-il lui-même un Either ? */
async function callbackReturnsEither(callback: TsAST.Expression, context: BuildContext) {
	const { typeChecker } = context.transpilation;
	const signature = DArray.first(
		await typeChecker.getSignaturesOfType(
			await typeChecker.getTypeAtLocation(callback),
			SignatureKind.Call,
		),
	);

	if (!signature) {
		return context.error(callback, "callback-without-call-signature");
	}

	const issues = await readEitherIssues(await signature.getReturnType(), callback, context);

	if (DEither.isLeft(issues) && !DEither.hasInformation(issues, "none")) {
		return issues;
	}

	return DEither.success(DEither.isRight(issues));
}

/**
 * Traduction de `whenIsRight` pour une entrée donnée (D-16, D-18) :
 * - succès : `f(valeur)` est renvoyé **brut**, rangé avec `TagValue` ;
 * - sinon : l'entrée est renvoyée telle quelle.
 * Si `f` renvoie lui-même un Either, DuploJS renvoie cet Either : c'est
 * exactement `RightThen`, réutilisé tel quel.
 */
function whenIsRightOperation(
	onRight: TsAST.Expression,
	context: BuildContext,
): EitherOperation {
	return async(operand) => {
		const shape = await DCommon.asyncPipe(
			analyzeEitherOfType(operand.type, operand.node, context),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(shape)) {
			return shape;
		}

		const returnsEither = await DCommon.asyncPipe(callbackReturnsEither(onRight, context), DEither.unwrapRight);

		if (DEither.isLeft(returnsEither)) {
			return returnsEither;
		}

		const onRightExpression = await DCommon.asyncPipe(
			transformCallback(
				{
					node: onRight,
					parameterTypes: [inferParameter],
					returnType: returnsEither ? eitherAnyGoType(context) : undefined,
				},
				context,
			),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(onRightExpression)) {
			return onRightExpression;
		}

		// `WhenIsRight` utilise la constante `TagValue` : elle doit exister.
		if (!returnsEither) {
			registerEitherTag(context, "value", valueInformation);
		}

		const helper = returnsEither
			? {
				packageName: context.registerSharedDependency(rightThenDependency.value),
				identifier: rightThenIdentifier,
			}
			: {
				packageName: context.registerSharedDependency(whenIsRightDependency.value),
				identifier: whenIsRightIdentifier,
			};

		return context.success({
			before: DArray.concat(operand.before, onRightExpression.before),
			result: GoAST.createCallExpression({
				callee: GoAST.createSelectorExpression({
					target: helper.packageName,
					identifier: helper.identifier,
				}),
				arguments: [operand.expression, onRightExpression.result],
			}),
		});
	};
}

/**
 * `DEither.whenIsRight(result, f)` (avec données) ou `DEither.whenIsRight(f)`
 * (curryfiée, par exemple dans un `pipe` : devient une fonction Go).
 */
export async function whenIsRightExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node)) {
		return context.error(node, "when-is-right-must-be-called");
	}

	if (node.arguments.length === 2) {
		const [, onRight] = node.arguments as unknown as [TsAST.Expression, TsAST.Expression];

		return translateWithData(node, whenIsRightOperation(onRight, context), context);
	}

	if (node.arguments.length === 1) {
		const [onRight] = node.arguments as unknown as [TsAST.Expression];

		return translateCurried(node, whenIsRightOperation(onRight, context), context);
	}

	return context.error(node, "when-is-right-expects-one-or-two-arguments");
}
