import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST, GoPrinter } from "@go";
import type { Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { SignatureKind } from "typescript/async";
import type { BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { go } from "../../../shared/goBuilder";
import { sequenceOperands } from "../../../shared/sequence";
import { tsTypeToGo } from "../../../type/tsTypeToGo";
import { transformCallback } from "../../either/core/callback";
import { translateCurried, translateWithData, type EitherOperation } from "../../either/core/operand";
import { reduceDependency, reduceIdentifier, reducePushIdentifier, reduceStepIdentifier } from "./sharedDependency";

/**
 * `DArray.reduce(list, from, f)` et `DArray.reduce(from, f)` (curryfiée), D-23.
 * ```go
 * shard_dependencies.Reduce(list, from, f).(R)
 * ```
 * - `from` : une valeur simple (`0`, `""`) ou `DArray.reduceFrom(valeur)` ;
 * - `f` reçoit le struct d'outils (`tsTypeToGo` le construit) et renvoie une
 *   `ReduceStep` ; `nextPush` existe si le résultat est un tableau (`ReducePush`) ;
 * - le résultat (`any`) est ouvert vers le type TS de `reduce` quand il est précis.
 * `nextWithObject` n'est pas encore traduit : erreur claire.
 */

type HandlerResult = ReturnType<Transformer<GoAST.Expression>["transformer"]>;

function usesName(node: TsAST.Node, name: string): boolean {
	if (TsAST.isIdentifier(node)) {
		return node.text === name;
	}

	return node.forEachChild((child) => usesName(child, name) || undefined) ?? false;
}

/** Type TS de `lastValue` : le premier paramètre du callback, `ReduceTheFunctionParams<A, O>`. */
async function lastValueType(theFunction: TsAST.Expression, context: BuildContext) {
	const { typeChecker } = context.transpilation;
	const signature = DArray.first(
		await typeChecker.getSignaturesOfType(await typeChecker.getTypeAtLocation(theFunction), SignatureKind.Call),
	);
	const parameter = signature && DArray.first(await signature.getParameters());
	const paramsType = parameter && await typeChecker.getTypeOfSymbol(parameter);

	return paramsType && typeChecker.getTypeOfPropertyOfType(paramsType, "lastValue");
}

function reduceOperation(
	fromValue: TsAST.Expression,
	theFunction: TsAST.Expression,
	context: BuildContext,
): EitherOperation {
	return async(operand, outputType) => {
		if (usesName(theFunction, "nextWithObject")) {
			return context.error(theFunction, "reduce-next-with-object-not-supported-yet");
		}

		const lastValue = await lastValueType(theFunction, context);
		const lastValueGo = lastValue && await DCommon.asyncPipe(
			tsTypeToGo(lastValue, theFunction, context),
			DEither.unwrapRight,
		);

		if (!lastValueGo) {
			return context.error(theFunction, "reduce-callback-needs-one-parameter");
		}

		if (DEither.isLeft(lastValueGo)) {
			return lastValueGo;
		}

		const withPush = GoPrinter.renderNode(lastValueGo).startsWith("[]");
		const paramsType = await DCommon.asyncPipe(
			tsTypeToGo(await context.transpilation.typeChecker.getTypeAtLocation(theFunction), theFunction, context),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(paramsType) || !("arguments" in paramsType)) {
			return context.error(theFunction, "reduce-callback-type-not-supported");
		}

		const from = await context.transformPrepared(fromValue, expressionTransformers.value);

		if (DEither.isLeft(from)) {
			return from;
		}

		const callback = await DCommon.asyncPipe(
			transformCallback(
				{
					node: theFunction,
					parameterTypes: [DArray.first(paramsType.arguments)!.type],
					returnType: GoAST.createPackageTypeReference({
						packageName: context.registerSharedDependency(reduceDependency.value),
						identifier: reduceStepIdentifier,
					}),
				},
				context,
			),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(callback)) {
			return callback;
		}

		// La liste, puis la valeur de départ, puis le callback : l'ordre de JavaScript.
		const { before, operands } = await sequenceOperands([
			{
				node: operand.node,
				before: operand.before,
				operand: operand.expression,
			},
			{
				node: fromValue,
				...from,
			},
			{
				node: theFunction,
				before: callback.before,
				operand: callback.result,
			},
		], context);

		const call = go.call(
			go.select(
				context.registerSharedDependency(reduceDependency.value),
				(withPush ? reducePushIdentifier : reduceIdentifier).value,
			),
			operands,
		);

		const output = await DCommon.asyncPipe(tsTypeToGo(outputType, operand.node, context), DEither.unwrapRight);

		if (DEither.isLeft(output)) {
			return output;
		}

		return context.success({
			before,
			result: GoPrinter.renderNode(output) === "any" ? call : go.assert(call, output),
		});
	};
}

export function reduceHandler(node: TsAST.Node, context: BuildContext): Promise<HandlerResult> {
	if (!TsAST.isCallExpression(node)) {
		return Promise.resolve(context.error(node, "reduce-must-be-called"));
	}

	const argumentsList = node.arguments as unknown as readonly TsAST.Expression[];

	if (argumentsList.length === 3) {
		const [, fromValue, theFunction] = argumentsList as [TsAST.Expression, TsAST.Expression, TsAST.Expression];

		return translateWithData(node, reduceOperation(fromValue, theFunction, context), context);
	}

	if (argumentsList.length === 2) {
		const [fromValue, theFunction] = argumentsList as [TsAST.Expression, TsAST.Expression];

		return translateCurried(node, reduceOperation(fromValue, theFunction, context), context);
	}

	return Promise.resolve(context.error(node, "reduce-expects-two-or-three-arguments"));
}

/** `DArray.reduceFrom(valeur)` : en Go, simplement la valeur. */
export async function reduceFromHandler(node: TsAST.Node, context: BuildContext): Promise<HandlerResult> {
	if (!TsAST.isCallExpression(node) || node.arguments.length !== 1) {
		return context.error(node, "reduce-from-expects-one-argument");
	}

	const [value] = node.arguments as unknown as [TsAST.Expression];

	return context.transform(value, expressionTransformers.value);
}
