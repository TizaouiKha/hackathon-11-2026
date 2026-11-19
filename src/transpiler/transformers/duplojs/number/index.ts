import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoPrinter, type GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import type { BuildContext } from "../../../context/build";
import { expressionTransformers } from "../../expression";
import { go } from "../../shared/goBuilder";
import { sequenceOperands, type SequencedOperand } from "../../shared/sequence";
import { tsTypeToGo } from "../../type/tsTypeToGo";
import { translateCurried, translateWithData, type EitherOperation } from "../either/core/operand";
import { numberDependency, numberHelperNames, type NumberFunctionName } from "./sharedDependency";

/**
 * Domaine `@duplojs/lang/number` (`DNumber.*`, D-25) : chaque fonction appelle son
 * helper Go (`sharedDependency.ts`).
 * - avec données : `DNumber.greaterThan(x, 3)` -> `NumberGreaterThan(x, 3)` ;
 * - curryfiée : `DNumber.greaterThan(3)` -> `func(value float64) bool { … }` ;
 * - en valeur : `DArray.filter(list, DNumber.isEven)` -> `NumberIsEven`.
 */

type HandlerResult = ReturnType<Transformer<GoAST.Expression>["transformer"]>;

/** Nombre d'arguments de la forme avec données. */
const arities: Record<NumberFunctionName, number> = {
	greaterThan: 2,
	greaterThanOrEqual: 2,
	lessThan: 2,
	lessThanOrEqual: 2,
	betweenThan: 3,
	betweenThanOrEqual: 3,
	isMultipleOf: 2,
	isEven: 1,
	isOdd: 1,
	isInteger: 1,
	isNegative: 1,
	isPositive: 1,
	isStrictNegative: 1,
	isStrictPositive: 1,
	isNotZero: 1,
	isSafe: 1,
	sum: 1,
	max: 1,
	min: 1,
	maxOf: 1,
	minOf: 1,
	sort: 2,
};

const listFunctions: ReadonlySet<NumberFunctionName> = new Set(["sum", "max", "min", "maxOf", "minOf", "sort"]);

function helper(name: NumberFunctionName, context: BuildContext) {
	return go.select(context.registerSharedDependency(numberDependency.value), numberHelperNames[name]);
}

/** L'entrée, puis les autres arguments, dans l'ordre de JavaScript. */
function numberOperation(
	name: NumberFunctionName,
	others: readonly TsAST.Expression[],
	context: BuildContext,
): EitherOperation {
	return async(operand) => {
		if (listFunctions.has(name)) {
			const inputType = await DCommon.asyncPipe(
				tsTypeToGo(operand.type, operand.node, context),
				DEither.unwrapRight,
			);

			if (DEither.isLeft(inputType) || GoPrinter.renderNode(inputType) !== "[]float64") {
				return context.error(operand.node, `${name}-expects-an-array-of-numbers`);
			}
		}

		const prepared: SequencedOperand[] = [
			{
				node: operand.node,
				before: operand.before,
				operand: operand.expression,
			},
		];

		for (const other of others) {
			const transformed = await context.transformPrepared(other, expressionTransformers.value);

			if (DEither.isLeft(transformed)) {
				return transformed;
			}

			prepared.push({
				node: other,
				...transformed,
			});
		}

		const { before, operands } = await sequenceOperands(prepared, context);

		return context.success({
			before,
			result: go.call(helper(name, context), operands),
		});
	};
}

function numberHandler(name: NumberFunctionName) {
	const arity = arities[name];

	return (node: TsAST.Node, context: BuildContext): Promise<HandlerResult> => {
		// Passée en valeur : le helper Go est déjà une fonction du bon type.
		if (!TsAST.isCallExpression(node)) {
			return Promise.resolve(arity === 1
				? context.success({ result: helper(name, context) })
				: context.error(node, `${name}-must-be-called`));
		}

		const argumentsList = node.arguments as unknown as readonly TsAST.Expression[];

		if (argumentsList.length === arity) {
			return translateWithData(node, numberOperation(name, argumentsList.slice(1), context), context);
		}

		if (arity > 1 && argumentsList.length === arity - 1) {
			return translateCurried(node, numberOperation(name, argumentsList, context), context);
		}

		return Promise.resolve(context.error(node, `${name}-unexpected-number-of-arguments`));
	};
}

const numberHandlers = Object.fromEntries(
	(Object.keys(arities) as NumberFunctionName[]).map((name) => [name, numberHandler(name)]),
) as Record<string, ReturnType<typeof numberHandler>>;

/** Routeur du domaine `@duplojs/lang/number`. */
export const duploJSNumberExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		const reference = TsAST.isCallExpression(node)
			? node.expression
			: node;

		if (!TsAST.isIdentifier(reference) && !TsAST.isPropertyAccessExpression(reference)) {
			return context.notSupport();
		}

		const moduleReference = await DCommon.asyncPipe(
			context.resolveReferenceModule(reference, "@duplojs/lang", /^dist\/number\//),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(moduleReference)) {
			return context.notSupport();
		}

		const { name } = moduleReference.symbol;

		return Object.hasOwn(numberHandlers, name)
			? numberHandlers[name]!(node, context)
			: context.notSupport();
	},
);
