import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoPrinter, type GoAST } from "@go";
import type { Transformer } from "@transformer";
import { TsAST } from "@typescript";
import type { BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { go } from "../../../shared/goBuilder";
import { sequenceOperands } from "../../../shared/sequence";
import { tsTypeToGo, type GoType } from "../../../type/tsTypeToGo";
import { transformCallback } from "../../either/core/callback";
import {
	translateCurried,
	translateFunctionValue,
	translateWithData,
	type EitherOperand,
	type EitherOperation,
} from "../../either/core/operand";
import { mapParamsType } from "../map/sharedDependency";
import {
	arrayIterationDependency,
	arrayIterationIdentifiers,
	type PredicateFunctionName,
} from "./sharedDependency";

/**
 * Fonctions `DArray` du lot « étape 12 » :
 * - avec un prédicat `(element, { index, self }) => boolean` : `filter`, `find`,
 *   `findIndex`, `some`, `every` ;
 * - avec des valeurs : `includes`, `push`, `concat` ;
 * - `length`, traduit directement en `float64(len(x))`.
 * Chacune existe avec données (`DArray.filter(list, f)`) et curryfiée
 * (`DArray.filter(f)`, par exemple dans un `pipe`).
 */

type HandlerResult = ReturnType<Transformer<GoAST.Expression>["transformer"]>;

function helper(context: BuildContext, name: keyof typeof arrayIterationIdentifiers) {
	const packageName = context.registerSharedDependency(arrayIterationDependency.value);

	return go.select(packageName, arrayIterationIdentifiers[name].value);
}

async function goTypeOf(type: Parameters<typeof tsTypeToGo>[0], node: TsAST.Node, context: BuildContext) {
	return DCommon.asyncPipe(tsTypeToGo(type, node, context), DEither.unwrapRight);
}

/** Type Go de l'entrée et de ses éléments (`[]T` -> `T`). */
async function sliceOf(operand: EitherOperand, context: BuildContext) {
	const goType = await goTypeOf(operand.type, operand.node, context);

	if (DEither.isLeft(goType)) {
		return goType;
	}

	const element = "elementType" in goType && GoPrinter.renderNode(goType).startsWith("[]")
		? goType.elementType as GoType
		: undefined;

	return element
		? {
			slice: goType,
			element,
		}
		: context.error(operand.node, "darray-expects-an-array-with-one-element-type");
}

/** Type Go du résultat attendu pour chaque fonction à prédicat. */
const predicateResults: Record<PredicateFunctionName, (slice: string) => string> = {
	filter: (slice) => slice,
	find: () => "any",
	findIndex: () => "any",
	some: () => "bool",
	every: () => "bool",
};

function predicateOperation(
	name: PredicateFunctionName,
	predicate: TsAST.Expression,
	context: BuildContext,
): EitherOperation {
	return async(operand, outputType) => {
		const input = await sliceOf(operand, context);

		if (DEither.isLeft(input)) {
			return input;
		}

		const output = await goTypeOf(outputType, operand.node, context);

		if (DEither.isLeft(output)) {
			return output;
		}

		// `filter` avec un type guard (`(A | B)[]` -> `A[]`) change le type des éléments.
		if (GoPrinter.renderNode(output) !== predicateResults[name](GoPrinter.renderNode(input.slice))) {
			return context.error(operand.node, `${name}-result-type-not-supported-yet`);
		}

		const callback = await DCommon.asyncPipe(
			transformCallback(
				{
					node: predicate,
					parameterTypes: [input.element, mapParamsType(input.slice)],
					returnType: go.types.bool,
				},
				context,
			),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(callback)) {
			return callback;
		}

		return context.success({
			before: DArray.concat(operand.before, callback.before),
			result: go.call(helper(context, name), [operand.expression, callback.result]),
		});
	};
}

/** Un élément Go comparable avec `==` (pas de slice, de map ni de fonction). */
function isComparable(element: GoType) {
	return !/\[\]|map\[|func\(/u.test(GoPrinter.renderNode(element));
}

/**
 * `includes`, `push`, `concat` : l'entrée puis les valeurs, évaluées dans l'ordre
 * de JavaScript. `concat` n'accepte que des tableaux du même type.
 */
function valuesOperation(
	name: "includes" | "push" | "concat",
	values: readonly TsAST.Expression[],
	context: BuildContext,
): EitherOperation {
	return async(operand, outputType) => {
		const input = await sliceOf(operand, context);

		if (DEither.isLeft(input)) {
			return input;
		}

		if (name === "includes" && !isComparable(input.element)) {
			return context.error(operand.node, "includes-needs-comparable-elements");
		}

		if (name !== "includes") {
			const output = await goTypeOf(outputType, operand.node, context);

			if (DEither.isLeft(output) || GoPrinter.renderNode(output) !== GoPrinter.renderNode(input.slice)) {
				return context.error(operand.node, `${name}-result-type-not-supported-yet`);
			}
		}

		const { typeChecker } = context.transpilation;
		const prepared = [];

		for (const value of values) {
			if (name === "concat") {
				const valueType = await goTypeOf(await typeChecker.getTypeAtLocation(value), value, context);

				const sameType = !DEither.isLeft(valueType)
					&& GoPrinter.renderNode(valueType) === GoPrinter.renderNode(input.slice);

				if (!sameType) {
					return context.error(value, "concat-expects-arrays-of-the-same-type");
				}
			}

			const transformed = await context.transformPrepared(value, expressionTransformers.value);

			if (DEither.isLeft(transformed)) {
				return transformed;
			}

			prepared.push({
				node: value,
				...transformed,
			});
		}

		const { before, operands } = await sequenceOperands([
			{
				node: operand.node,
				before: operand.before,
				operand: operand.expression,
			},
			...prepared,
		], context);

		return context.success({
			before,
			result: go.call(helper(context, name), operands),
		});
	};
}

function lengthOperation(context: BuildContext): EitherOperation {
	return async(operand) => {
		const input = await sliceOf(operand, context);

		return DEither.isLeft(input)
			? input
			: context.success({
				before: operand.before,
				result: go.convert(go.types.float64, go.call("len", [operand.expression])),
			});
	};
}

/** Une fonction `DArray` passée comme valeur (`pipe(list, DArray.length)`). */
async function asFunctionValue(
	node: TsAST.Node,
	operation: EitherOperation,
	context: BuildContext,
): Promise<HandlerResult> {
	const expectedType = TsAST.isExpression(node)
		? await context.transpilation.typeChecker.getContextualType(node)
		: undefined;

	if (!expectedType || !TsAST.isExpression(node)) {
		return context.error(node, "darray-function-as-value-needs-an-expected-type");
	}

	return translateFunctionValue(node, expectedType, operation, context);
}

export function predicateHandler(name: PredicateFunctionName) {
	return (node: TsAST.Node, context: BuildContext): Promise<HandlerResult> => {
		if (!TsAST.isCallExpression(node)) {
			return Promise.resolve(context.error(node, `${name}-must-be-called`));
		}

		const [first, second] = node.arguments as unknown as TsAST.Expression[];

		if (node.arguments.length === 2 && second) {
			return translateWithData(node, predicateOperation(name, second, context), context);
		}

		if (node.arguments.length === 1 && first) {
			return translateCurried(node, predicateOperation(name, first, context), context);
		}

		return Promise.resolve(context.error(node, `${name}-expects-one-or-two-arguments`));
	};
}

/**
 * `includes(list, value)` / `includes(value)` ; `push(list, ...values)` /
 * `push(value)` ; `concat(list, ...lists)` / `concat(list)`.
 */
export function valuesHandler(name: "includes" | "push" | "concat") {
	return (node: TsAST.Node, context: BuildContext): Promise<HandlerResult> => {
		if (!TsAST.isCallExpression(node) || node.arguments.length === 0) {
			return Promise.resolve(context.error(node, `${name}-must-be-called-with-arguments`));
		}

		const argumentsList = node.arguments as unknown as readonly TsAST.Expression[];

		if (argumentsList.length === 1) {
			return translateCurried(node, valuesOperation(name, argumentsList, context), context);
		}

		if (name === "includes" && argumentsList.length !== 2) {
			return Promise.resolve(context.error(node, "includes-expects-one-or-two-arguments"));
		}

		return translateWithData(node, valuesOperation(name, argumentsList.slice(1), context), context);
	};
}

export function lengthHandler(node: TsAST.Node, context: BuildContext): Promise<HandlerResult> {
	if (!TsAST.isCallExpression(node)) {
		return asFunctionValue(node, lengthOperation(context), context);
	}

	return node.arguments.length === 1
		? translateWithData(node, lengthOperation(context), context)
		: Promise.resolve(context.error(node, "length-expects-one-argument"));
}
