import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST, GoPrinter } from "@go";
import type { Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { SignatureKind, type Type } from "typescript/async";
import type { BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { javascriptValuesDependency } from "../../../expression/javascriptValues";
import { go } from "../../../shared/goBuilder";
import { sequenceOperands, type SequencedOperand } from "../../../shared/sequence";
import { tsTypeToGo, type GoType } from "../../../type/tsTypeToGo";
import { transformCallback } from "../../either/core/callback";
import {
	translateCurried,
	translateFunctionValue,
	translateWithData,
	type EitherOperand,
	type EitherOperation,
} from "../../either/core/operand";
import { commonBasicsDependency, commonHelperNames } from "./sharedDependency";

/**
 * Fonctions `DCommon` de base (D-26) : `when`, `whenNot`, `whenElse`, `equal`,
 * `and`, `or`, `tap`, `truthy`, `falsy`, `isType`, `justExec`, `justReturn`,
 * `forward`. Avec données, curryfiées, et (pour celles à un argument) passées
 * en valeur, typées alors par le contexte.
 */

type HandlerResult = ReturnType<Transformer<GoAST.Expression>["transformer"]>;
export type CommonHandler = (node: TsAST.Node, context: BuildContext) => Promise<HandlerResult>;

const supportedKinds: ReadonlySet<string> = new Set(["string", "number", "boolean", "undefined", "null"]);

function helper(name: keyof typeof commonHelperNames, context: BuildContext) {
	return go.select(context.registerSharedDependency(commonBasicsDependency.value), commonHelperNames[name]);
}

async function goTypeOf(type: Type, node: TsAST.Node, context: BuildContext) {
	return DCommon.asyncPipe(tsTypeToGo(type, node, context), DEither.unwrapRight);
}

/** Ouvre le `any` d'un helper vers le type TS du résultat, quand il est précis. */
async function toOutput(call: GoAST.Expression, outputType: Type, node: TsAST.Node, context: BuildContext) {
	const output = await goTypeOf(outputType, node, context);

	if (DEither.isLeft(output)) {
		return output;
	}

	return GoPrinter.renderNode(output) === "any" ? call : go.assert(call, output);
}

function operandItem(operand: EitherOperand): SequencedOperand {
	return {
		node: operand.node,
		before: operand.before,
		operand: operand.expression,
	};
}

/** Un callback qui reçoit l'entrée ; `returns` : `bool` pour un prédicat, sinon son propre type. */
async function inputCallback(node: TsAST.Expression, inputGo: GoType, context: BuildContext, returns?: GoType) {
	const callback = await DCommon.asyncPipe(
		transformCallback({
			node,
			parameterTypes: [inputGo],
			returnType: returns,
		}, context),
		DEither.unwrapRight,
	);

	return DEither.isLeft(callback)
		? callback
		: {
			node,
			before: callback.before,
			operand: callback.result,
		} satisfies SequencedOperand;
}

/** `when` / `whenNot` (prédicat, fonction) et `whenElse` (prédicat, alors, sinon). */
function conditionalOperation(
	name: "when" | "whenNot" | "whenElse",
	callbacks: readonly TsAST.Expression[],
	context: BuildContext,
): EitherOperation {
	return async(operand, outputType) => {
		const inputGo = await goTypeOf(operand.type, operand.node, context);

		if (DEither.isLeft(inputGo)) {
			return inputGo;
		}

		const items: SequencedOperand[] = [operandItem(operand)];

		for (const [index, callback] of callbacks.entries()) {
			const translated = await inputCallback(callback, inputGo, context, index === 0 ? go.types.bool : undefined);

			if (DEither.isLeft(translated)) {
				return translated;
			}

			items.push(translated);
		}

		const { before, operands } = await sequenceOperands(items, context);
		const result = await toOutput(go.call(helper(name, context), operands), outputType, operand.node, context);

		return DEither.isLeft(result)
			? result
			: context.success({
				before,
				result,
			});
	};
}

function isComparable(type: GoType) {
	return !/^(?:struct|\[\]|map\[|func)/u.test(GoPrinter.renderNode(type));
}

/** `equal(x, v)` : `x == v` ; `equal(x, [a, b])` : `JSEqualOneOf(x, a, b)` (comme `includes`). */
function equalOperation(value: TsAST.Expression, context: BuildContext): EitherOperation {
	return async(operand) => {
		const inputGo = await goTypeOf(operand.type, operand.node, context);

		if (DEither.isLeft(inputGo) || !isComparable(inputGo)) {
			return context.error(operand.node, "equal-supports-only-primitive-values");
		}

		const values = TsAST.isArrayLiteralExpression(value)
			? [...value.elements as unknown as readonly TsAST.Expression[]]
			: [value];
		const items: SequencedOperand[] = [operandItem(operand)];

		if (
			!TsAST.isArrayLiteralExpression(value)
			&& await context.transpilation.typeChecker.isArrayType(
				await context.transpilation.typeChecker.getTypeAtLocation(value),
			)
		) {
			return context.error(value, "equal-with-a-list-must-be-a-literal-array");
		}

		for (const element of values) {
			const transformed = await context.transformPrepared(element, expressionTransformers.value);

			if (DEither.isLeft(transformed)) {
				return transformed;
			}

			items.push({
				node: element,
				...transformed,
			});
		}

		const { before, operands } = await sequenceOperands(items, context);
		const [input, ...others] = operands;

		return context.success({
			before,
			result: TsAST.isArrayLiteralExpression(value)
				? go.call(helper("equalOneOf", context), operands)
				: go.binary(input!, "==", others[0]!),
		});
	};
}

/** `and(x, [p, q])` : `p(x) && q(x)` (court-circuit comme JS) ; `or` : `||`. */
function logicalOperation(name: "and" | "or", list: TsAST.Expression, context: BuildContext): EitherOperation {
	return async(operand) => {
		if (!TsAST.isArrayLiteralExpression(list)) {
			return context.error(list, `${name}-expects-a-literal-array-of-predicates`);
		}

		const inputGo = await goTypeOf(operand.type, operand.node, context);

		if (DEither.isLeft(inputGo)) {
			return inputGo;
		}

		const items: SequencedOperand[] = [operandItem(operand)];

		for (const predicate of list.elements as unknown as readonly TsAST.Expression[]) {
			const translated = await inputCallback(predicate, inputGo, context, go.types.bool);

			if (DEither.isLeft(translated)) {
				return translated;
			}

			items.push(translated);
		}

		const sequenced = await sequenceOperands(items, context);
		const [rawInput, ...calls] = sequenced.operands;
		const before = [...sequenced.before];
		let input = rawInput!;

		// L'entrée est relue par chaque prédicat : une variable si ce n'est pas un nom.
		if (!DModeling.hasTagValue(input, "[node]identifier")) {
			const identifier = context.generateIdentifier();

			before.push(GoAST.createShortVariableDeclarationStatement({
				identifier,
				initializer: input,
			}));
			input = identifier;
		}

		const result = calls
			.map((predicate) => go.call(predicate, [input]) as GoAST.Expression)
			.reduce<GoAST.Expression | undefined>(
				(chain, call) => (chain ? go.binary(chain, name === "and" ? "&&" : "||", call) : call),
				undefined,
			);

		return context.success({
			before,
			result: result ?? go.bool(name === "and"),
		});
	};
}

function tapOperation(theFunction: TsAST.Expression, context: BuildContext): EitherOperation {
	return async(operand) => {
		const inputGo = await goTypeOf(operand.type, operand.node, context);

		if (DEither.isLeft(inputGo)) {
			return inputGo;
		}

		const callback = await inputCallback(theFunction, inputGo, context);

		if (DEither.isLeft(callback)) {
			return callback;
		}

		const { before, operands } = await sequenceOperands([operandItem(operand), callback], context);

		return context.success({
			before,
			result: go.call(helper("tap", context), operands),
		});
	};
}

function truthyOperation(negate: boolean, context: BuildContext): EitherOperation {
	return (operand) => {
		const call = go.call(helper("truthy", context), [operand.expression]);

		return Promise.resolve(context.success({
			before: operand.before,
			result: negate ? go.not(call) : call,
		}));
	};
}

function isTypeOperation(kind: TsAST.Expression, context: BuildContext): EitherOperation {
	return async(operand) => {
		const kindType = await context.transpilation.typeChecker.getTypeAtLocation(kind);
		const kindName = kindType.isStringLiteralType() ? kindType.value : undefined;

		if (!kindName || !supportedKinds.has(kindName)) {
			return context.error(kind, "is-type-supports-only-string-number-boolean-undefined-null");
		}

		context.registerSharedDependency(javascriptValuesDependency.value);

		return context.success({
			before: operand.before,
			result: go.call(helper("isType", context), [operand.expression, go.string(kindName)]),
		});
	};
}

function forwardOperation(context: BuildContext): EitherOperation {
	return (operand) => Promise.resolve(context.success({
		before: operand.before,
		result: operand.expression,
	}));
}

/** Passée en valeur (`DArray.filter(list, DCommon.truthy)`) : fonction typée par le contexte. */
async function asFunctionValue(
	node: TsAST.Node,
	operation: EitherOperation,
	context: BuildContext,
): Promise<HandlerResult> {
	const expectedType = TsAST.isExpression(node)
		? await context.transpilation.typeChecker.getContextualType(node)
		: undefined;

	if (!expectedType || !TsAST.isExpression(node)) {
		return context.error(node, "dcommon-function-as-value-needs-an-expected-type");
	}

	return translateFunctionValue(node, expectedType, operation, context);
}

/**
 * Forme avec données (`arity` arguments, l'entrée d'abord), curryfiée
 * (`arity - 1`), ou en valeur pour les fonctions à un argument.
 */
function withData(
	name: string,
	arity: number,
	operation: (others: readonly TsAST.Expression[], context: BuildContext) => EitherOperation,
): CommonHandler {
	return (node, context) => {
		if (!TsAST.isCallExpression(node)) {
			return arity === 1
				? asFunctionValue(node, operation([], context), context)
				: Promise.resolve(context.error(node, `${name}-must-be-called`));
		}

		const argumentsList = node.arguments as unknown as readonly TsAST.Expression[];

		if (argumentsList.length === arity) {
			return translateWithData(node, operation(argumentsList.slice(1), context), context);
		}

		if (arity > 1 && argumentsList.length === arity - 1) {
			return translateCurried(node, operation(argumentsList, context), context);
		}

		return Promise.resolve(context.error(node, `${name}-unexpected-number-of-arguments`));
	};
}

/** `justExec(f)` : `f()`. */
const justExecHandler: CommonHandler = async(node, context) => {
	if (!TsAST.isCallExpression(node) || node.arguments.length !== 1) {
		return context.error(node, "just-exec-expects-one-function");
	}

	const callee = await context.transformPrepared(DArray.first(node.arguments)!, expressionTransformers.value);

	return DEither.isLeft(callee)
		? callee
		: context.success({
			before: callee.before,
			result: go.call(callee.operand, []),
		});
};

/**
 * `justReturn(v)` : une fonction qui ignore ses arguments et renvoie `v`, typée
 * par la signature attendue ; `v` est évalué une seule fois, tout de suite.
 */
const justReturnHandler: CommonHandler = async(node, context) => {
	if (!TsAST.isCallExpression(node) || node.arguments.length !== 1) {
		return context.error(node, "just-return-supports-only-the-curried-form");
	}

	const { typeChecker } = context.transpilation;
	// Sa propre signature, instanciée à cet endroit : `(input: string) => number`.
	const signature = DArray.first(await typeChecker.getSignaturesOfType(
		await typeChecker.getTypeAtLocation(node),
		SignatureKind.Call,
	));

	if (!signature) {
		return context.error(node, "just-return-without-signature");
	}

	const parameters: GoAST.FunctionArgument[] = [];

	for (const parameter of await signature.getParameters()) {
		const parameterGo = await goTypeOf(await typeChecker.getTypeOfSymbol(parameter), node, context);

		if (DEither.isLeft(parameterGo)) {
			return parameterGo;
		}

		parameters.push(go.parameter("_", parameterGo));
	}

	const returned = await goTypeOf(await signature.getReturnType(), node, context);
	const value = await context.transformPrepared(DArray.first(node.arguments)!, expressionTransformers.value);

	if (DEither.isLeft(returned)) {
		return returned;
	}

	if (DEither.isLeft(value)) {
		return value;
	}

	return context.success({
		before: value.before,
		result: GoAST.createFunctionLiteral({
			arguments: parameters,
			returnTypes: [returned],
			body: go.block([go.return(value.operand)]),
		}),
	});
};

export const commonBasicsHandlers: Record<string, CommonHandler> = {
	when: withData("when", 3, (callbacks, context) => conditionalOperation("when", callbacks, context)),
	whenNot: withData("whenNot", 3, (callbacks, context) => conditionalOperation("whenNot", callbacks, context)),
	whenElse: withData("whenElse", 4, (callbacks, context) => conditionalOperation("whenElse", callbacks, context)),
	equal: withData("equal", 2, ([value], context) => equalOperation(value!, context)),
	and: withData("and", 2, ([list], context) => logicalOperation("and", list!, context)),
	or: withData("or", 2, ([list], context) => logicalOperation("or", list!, context)),
	tap: withData("tap", 2, ([theFunction], context) => tapOperation(theFunction!, context)),
	truthy: withData("truthy", 1, (_others, context) => truthyOperation(false, context)),
	falsy: withData("falsy", 1, (_others, context) => truthyOperation(true, context)),
	isType: withData("isType", 2, ([kind], context) => isTypeOperation(kind!, context)),
	forward: withData("forward", 1, (_others, context) => forwardOperation(context)),
	justExec: justExecHandler,
	justReturn: justReturnHandler,
};
