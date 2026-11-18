import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST, GoPrinter } from "@go";
import type { TsAST } from "@typescript";
import { SignatureKind } from "typescript/async";
import type { BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { tsTypeToGo, type GoType } from "../../../type/tsTypeToGo";
import { assertType } from "./goFunction";

/** Le paramètre reçu prend le type déclaré par le callback (ou `any`) : Go l'infère dans le helper générique. */
export const inferParameter = "infer";

export interface TransformCallbackParams {

	/** Fonction TS passée en argument (identifiant, fonction fléchée…). */
	readonly node: TsAST.Expression;

	/**
	 * Types Go des valeurs que le helper Go fournit au callback.
	 * `inferParameter` : le type déclaré par le callback lui-même.
	 */
	readonly parameterTypes: readonly (GoType | typeof inferParameter)[];

	/** Type Go de retour attendu par le helper ; par défaut, celui du callback. */
	readonly returnType?: GoType;
}

function render(type: GoType) {
	return GoPrinter.renderNode(type);
}

const anyType = GoAST.builtinTypeReferences.any;

/** Signature TS du callback : types Go de ses paramètres déclarés et de son retour. */
async function readCallbackSignature(node: TsAST.Expression, context: BuildContext) {
	const { typeChecker } = context.transpilation;
	const signature = DArray.first(
		await typeChecker.getSignaturesOfType(
			await typeChecker.getTypeAtLocation(node),
			SignatureKind.Call,
		),
	);

	if (!signature) {
		return context.error(node, "callback-without-call-signature");
	}

	const parameterTypes: GoType[] = [];

	for (const parameter of await signature.getParameters()) {
		const goType = await tsTypeToGo(await typeChecker.getTypeOfSymbol(parameter), node, context);

		if (DEither.isLeft(goType)) {
			return goType;
		}

		parameterTypes.push(DEither.unwrapRight(goType));
	}

	const returnType = await tsTypeToGo(await signature.getReturnType(), node, context);

	if (DEither.isLeft(returnType)) {
		return returnType;
	}

	return DEither.success({
		parameterTypes,
		returnType: DEither.unwrapRight(returnType),
	});
}

/**
 * Traduit une fonction passée en argument à un helper Go (D-18).
 *
 * TypeScript et Go ne communiquent pas pareil ; le callback est enveloppé quand :
 * - il déclare **moins** de paramètres que ce qu'il reçoit (`() => -1`) ;
 * - il reçoit un `any` (valeur d'un `EitherAny`) alors qu'il attend un type
 *   précis : on ouvre la boîte avec une assertion, sans risque puisque TypeScript
 *   a déjà vérifié le type ;
 * - il renvoie un autre type Go que celui attendu par le helper.
 * ```go
 * func(p any) string { return handler(p.(float64)) }
 * ```
 */
export async function transformCallback(
	params: TransformCallbackParams,
	context: BuildContext,
) {
	const { node } = params;
	const signature = await DCommon.asyncPipe(readCallbackSignature(node, context), DEither.unwrapRight);

	if (DEither.isLeft(signature)) {
		return signature;
	}

	if (signature.parameterTypes.length > params.parameterTypes.length) {
		return context.error(node, "callback-expects-too-many-parameters");
	}

	// Ce que le helper passe réellement à chaque position.
	const passedTypes = DArray.map(
		params.parameterTypes,
		(type, { index }) => (
			type === inferParameter
				? DArray.at(signature.parameterTypes, index) ?? anyType
				: type
		),
	);
	const returnType = params.returnType ?? signature.returnType;

	// Une assertion n'a de sens que pour ouvrir un `any` vers un type précis.
	const opensAny = (passed: GoType | undefined, target: GoType | undefined) => passed !== undefined
		&& target !== undefined
		&& render(passed) === render(anyType)
		&& render(target) !== render(anyType);

	const needsAssertion = DArray.some(
		signature.parameterTypes,
		(target, { index }) => opensAny(DArray.at(passedTypes, index), target),
	);
	const needsWrapper = signature.parameterTypes.length < passedTypes.length
		|| needsAssertion
		|| render(signature.returnType) !== render(returnType);

	const callee = await DCommon.asyncPipe(
		context.transform(node, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(callee)) {
		return callee;
	}

	if (!needsWrapper) {
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
		passedTypes,
		(type, { index }) => GoAST.createFunctionArgument({
			identifier: index < signature.parameterTypes.length
				? context.generateIdentifier()
				: GoAST.createIdentifier("_"),
			type,
		}),
	);

	const forwardedArguments = DArray.map(
		DArray.slice(wrapperArguments, 0, signature.parameterTypes.length),
		(argument, { index }) => {
			const target = DArray.at(signature.parameterTypes, index);

			return target && opensAny(argument.type, target)
				? assertType(argument.identifier, target)
				: argument.identifier;
		},
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
