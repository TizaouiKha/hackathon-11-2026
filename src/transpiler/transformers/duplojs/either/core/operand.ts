import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import type { TsAST } from "@typescript";
import { SignatureKind, type Type } from "typescript/async";
import type { Transformer } from "@transformer";
import type { BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { transformTsType } from "./analysis";

/**
 * Valeur d'entrée d'une opération Either, déjà traduite en Go.
 * - forme avec données : l'argument TS `DEither.whenIsRight(result, f)` ;
 * - forme curryfiée : le paramètre de la fonction Go générée pour `DEither.whenIsRight(f)`.
 */
export interface EitherOperand {

	/** Type TS de la valeur (pour choisir `Either` / `Either2`). */
	readonly type: Type;

	/** Nœud TS de référence pour le checker et les messages d'erreur. */
	readonly node: TsAST.Node;
	readonly before: readonly GoAST.Statement[];
	readonly expression: GoAST.Expression;
}

export type EitherOperationResult = Awaited<ReturnType<Transformer<GoAST.Expression>["transformer"]>>;

/** Traduction d'une opération à partir de son entrée et du type TS de son résultat. */
export type EitherOperation = (operand: EitherOperand, outputType: Type) => Promise<EitherOperationResult>;

/** Entrée d'une forme avec données : l'argument TS est traduit et typé par le checker. */
export async function operandFromArgument(argument: TsAST.Expression, context: BuildContext) {
	const expression = await DCommon.asyncPipe(
		context.transform(argument, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(expression)) {
		return expression;
	}

	return DEither.success<EitherOperand>({
		type: await context.transpilation.typeChecker.getTypeAtLocation(argument),
		node: argument,
		before: expression.before,
		expression: expression.result,
	});
}

/** Forme avec données : `DEither.whenIsRight(result, f)`. */
export async function translateWithData(
	call: TsAST.CallExpression,
	operation: EitherOperation,
	context: BuildContext,
): Promise<EitherOperationResult> {
	const input = DArray.first(call.arguments);

	if (!input) {
		return context.error(call, "either-operation-without-input");
	}

	const operand = await DCommon.asyncPipe(operandFromArgument(input, context), DEither.unwrapRight);

	if (DEither.isLeft(operand)) {
		return operand;
	}

	return operation(operand, await context.transpilation.typeChecker.getTypeAtLocation(call));
}

/**
 * Forme curryfiée (sans donnée) : `DEither.whenIsRight(f)` est une **fonction**
 * qui attend l'Either. Elle devient une fonction Go littérale :
 * ```go
 * func(input shard_dependencies.Either[float64]) R { return shard_dependencies.WhenIsRight(input, f, …) }
 * ```
 * Le type du paramètre et du résultat est lu sur la signature instanciée par le
 * checker (par exemple dans un `pipe`, où TypeScript connaît l'entrée).
 * Les préparations des callbacks restent **hors** de la fonction : en TS, `f`
 * est évalué une seule fois, à la création de la fonction curryfiée.
 */
export async function translateCurried(
	call: TsAST.CallExpression,
	operation: EitherOperation,
	context: BuildContext,
): Promise<EitherOperationResult> {
	return translateFunctionValue(
		call,
		await context.transpilation.typeChecker.getTypeAtLocation(call),
		operation,
		context,
	);
}

/**
 * Une opération utilisée **comme fonction** (`pipe(x, DEither.unwrapRight)`) :
 * même fonction Go littérale que la forme curryfiée, typée par `functionType`
 * (le type attendu par le contexte, la signature générique n'étant pas instanciée).
 */
export async function translateFunctionValue(
	call: TsAST.Expression,
	functionType: Type,
	operation: EitherOperation,
	context: BuildContext,
): Promise<EitherOperationResult> {
	const { typeChecker } = context.transpilation;
	const signature = DArray.first(
		await typeChecker.getSignaturesOfType(functionType, SignatureKind.Call),
	);
	const parameter = signature && DArray.first(await signature.getParameters());

	if (!signature || !parameter) {
		return context.error(call, "curried-either-operation-without-signature");
	}

	const inputType = await typeChecker.getTypeOfSymbol(parameter);
	const outputType = await signature.getReturnType();

	const inputGoType = await DCommon.asyncPipe(transformTsType(inputType, call, context), DEither.unwrapRight);

	if (DEither.isLeft(inputGoType)) {
		return inputGoType;
	}

	const outputGoType = await DCommon.asyncPipe(transformTsType(outputType, call, context), DEither.unwrapRight);

	if (DEither.isLeft(outputGoType)) {
		return outputGoType;
	}

	const inputIdentifier = context.generateIdentifier();

	const translated = await DCommon.asyncPipe(
		operation(
			{
				type: inputType,
				node: call,
				before: [],
				expression: inputIdentifier,
			},
			outputType,
		),
		DEither.keepAsRightByInformation("transformation-success"),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(translated)) {
		return DEither.hasInformation(translated, "transformation-not-supported")
			? context.error(call, "unsupported-curried-either-operation")
			: translated;
	}

	return context.success({
		before: translated.before,
		result: GoAST.createFunctionLiteral({
			arguments: [
				GoAST.createFunctionArgument({
					identifier: inputIdentifier,
					type: inputGoType,
				}),
			],
			returnTypes: [outputGoType],
			body: GoAST.createBlockStatement({
				statements: [
					GoAST.createReturnStatement({
						values: DCommon.cast([translated.result]),
					}),
				],
			}),
		}),
	});
}
