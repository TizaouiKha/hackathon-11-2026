import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import type { TsAST } from "@typescript";
import { SignatureKind } from "typescript/async";
import type { BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import type { EitherGoValueType } from "./type";

export interface TransformCallbackParams {

	/** Fonction TS passée en argument (identifiant, fonction fléchée…). */
	readonly node: TsAST.Expression;

	/** Types Go des paramètres que le helper Go fournit au callback. */
	readonly parameterTypes: readonly EitherGoValueType[];

	/** Type Go de retour attendu par le helper. */
	readonly returnType: EitherGoValueType;
}

async function countTsParameters(node: TsAST.Expression, context: BuildContext) {
	const { typeChecker } = context.transpilation;
	const signatures = await typeChecker.getSignaturesOfType(
		await typeChecker.getTypeAtLocation(node),
		SignatureKind.Call,
	);
	const signature = DArray.first(signatures);

	return signature
		? (await signature.getParameters()).length
		: undefined;
}

/**
 * Traduit une fonction passée en argument à un helper Go.
 *
 * En TypeScript, un callback peut déclarer moins de paramètres que ce qu'il
 * reçoit (`() => "échec"` pour un handler qui reçoit la valeur). Go exige la
 * signature exacte : le callback est alors enveloppé dans une fonction qui
 * reçoit tous les paramètres et n'en transmet que les premiers.
 * ```go
 * func(_ float64) string { return handler() }
 * ```
 */
export async function transformCallback(
	params: TransformCallbackParams,
	context: BuildContext,
) {
	const { node, parameterTypes, returnType } = params;
	const parameterCount = await countTsParameters(node, context);

	if (parameterCount === undefined) {
		return context.error(node, "callback-without-call-signature");
	}

	if (parameterCount > parameterTypes.length) {
		return context.error(node, "callback-expects-too-many-parameters");
	}

	const callee = await DCommon.asyncPipe(
		context.transform(node, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(callee)) {
		return callee;
	}

	if (parameterCount === parameterTypes.length) {
		return context.success({
			before: callee.before,
			result: callee.result,
		});
	}

	// Le callback est évalué une seule fois, avant d'être enveloppé.
	const calleeVariable = GoAST.createShortVariableDeclarationStatement({
		identifier: context.generateIdentifier(),
		initializer: callee.result,
	});

	const wrapperArguments = DArray.map(
		parameterTypes,
		(type, { index }) => GoAST.createFunctionArgument({
			identifier: index < parameterCount
				? context.generateIdentifier()
				: GoAST.createIdentifier("_"),
			type,
		}),
	);

	const forwardedArguments = DArray.map(
		DArray.slice(wrapperArguments, 0, parameterCount),
		(argument) => argument.identifier,
	);

	return context.success({
		before: DArray.concat(callee.before, [calleeVariable]),
		result: GoAST.createFunctionLiteral({
			arguments: wrapperArguments,
			returnTypes: [returnType],
			body: GoAST.createBlockStatement({
				statements: [
					GoAST.createReturnStatement({
						values: DCommon.cast([
							GoAST.createCallExpression({
								callee: calleeVariable.identifier,
								arguments: forwardedArguments,
							}),
						]),
					}),
				],
			}),
		}),
	});
}
