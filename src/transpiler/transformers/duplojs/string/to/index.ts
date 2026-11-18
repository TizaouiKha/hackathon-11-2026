import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { SignatureKind, TypeFlags, type Type } from "typescript/async";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { jsNumberToStringDependency, jsNumberToStringIdentifier } from "./sharedDependency";

function isNumberType(type: Type) {
	return (type.flags & TypeFlags.NumberLike) !== 0;
}

function helperReference(context: BuildContext) {
	return GoAST.createSelectorExpression({
		target: context.registerSharedDependency(jsNumberToStringDependency.value),
		identifier: jsNumberToStringIdentifier,
	});
}

/**
 * `DString.to` (D-12) : `` `${value}` `` en JavaScript.
 * - appelée : `DString.to(n)` -> `shard_dependencies.JSNumberToString(n)` ;
 * - passée comme fonction (`DArray.map(DString.to)`, `success: DString.to`) :
 *   -> `shard_dependencies.JSNumberToString`, de type `func(float64) string`.
 *
 * Pour l'instant, seule la conversion d'un **nombre** est traduite (c'est le
 * seul usage des exercices) ; les autres types renvoient une erreur explicite.
 */
export async function toExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	const { typeChecker } = context.transpilation;

	if (TsAST.isCallExpression(node)) {
		const value = DArray.first(node.arguments);

		if (!value || node.arguments.length !== 1) {
			return context.error(node, "dstring-to-expects-one-argument");
		}

		if (!isNumberType(await typeChecker.getTypeAtLocation(value))) {
			return context.error(value, "dstring-to-supports-only-numbers");
		}

		const valueExpression = await DCommon.asyncPipe(
			context.transform(value, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(valueExpression)) {
			return valueExpression;
		}

		return context.success({
			before: valueExpression.before,
			result: GoAST.createCallExpression({
				callee: helperReference(context),
				arguments: [valueExpression.result],
			}),
		});
	}

	// Passée comme fonction : le type attendu par le contexte dit ce qu'elle recevra.
	const expectedType = TsAST.isExpression(node)
		? await typeChecker.getContextualType(node)
		: undefined;
	const expectedSignature = expectedType && DArray.first(
		await typeChecker.getSignaturesOfType(expectedType, SignatureKind.Call),
	);
	const expectedParameter = expectedSignature && DArray.first(await expectedSignature.getParameters());

	if (!expectedParameter || !isNumberType(await typeChecker.getTypeOfSymbol(expectedParameter))) {
		return context.error(node, "dstring-to-as-value-supports-only-numbers");
	}

	return context.success({
		result: helperReference(context),
	});
}
