import { type Transformer } from "@transformer";
import { GoAST, GoPrinter } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { TypeFlags, type Type } from "typescript/async";
import { type BuildContext } from "../../../../context/build";
import { tsTypeToGo } from "../../../type/tsTypeToGo";
import { translateFunctionValue, translateWithData, type EitherOperation } from "../../either/core/operand";

type ArrayKind = "array" | "value" | "mixed";

/**
 * Le type est-il un tableau, une valeur, ou les deux ? Décidé **à la
 * compilation** : TypeScript a déjà fait le `instanceof Array` de DuploJS.
 */
async function arrayKind(type: Type, context: BuildContext): Promise<ArrayKind> {
	const { typeChecker } = context.transpilation;

	if ((type.flags & (TypeFlags.Any | TypeFlags.Unknown | TypeFlags.Instantiable)) !== 0) {
		return "mixed";
	}

	const members = type.isUnionType() ? (await type.getTypes()) ?? [] : [type];
	const kinds = new Set<ArrayKind>();

	for (const member of members) {
		const isArray = await typeChecker.isArrayType(member) || await typeChecker.isTupleType(member);

		kinds.add(isArray ? "array" : "value");
	}

	return kinds.size === 1 ? DArray.first([...kinds]) ?? "mixed" : "mixed";
}

/**
 * `DArray.coalescing(value)` : `value` si c'est un tableau, sinon `[value]`.
 * - tableau : l'expression telle quelle (rien à faire à l'exécution) ;
 * - valeur : la slice `[]T{value}` du type Go du résultat (`readonly [T]`) ;
 * - les deux (`number | number[]`, `unknown`) : pas encore traduit.
 */
function coalescingOperation(context: BuildContext): EitherOperation {
	return async(operand, outputType) => {
		const kind = await arrayKind(operand.type, context);

		if (kind === "array") {
			return context.success({
				before: operand.before,
				result: operand.expression,
			});
		}

		if (kind === "mixed") {
			return context.error(operand.node, "coalescing-of-array-or-value-not-supported-yet");
		}

		const outputGoType = await DCommon.asyncPipe(
			tsTypeToGo(outputType, operand.node, context),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(outputGoType)) {
			return outputGoType;
		}

		if (!GoPrinter.renderNode(outputGoType).startsWith("[]")) {
			return context.error(operand.node, "coalescing-result-must-be-a-slice");
		}

		return context.success({
			before: operand.before,
			result: GoAST.createSliceLiteral({
				typeReference: outputGoType as GoAST.SliceType,
				elements: [operand.expression],
			}),
		});
	};
}

/**
 * `DArray.coalescing(value)`, ou `DArray.coalescing` passé comme fonction
 * (`DEither.whenIsRight(result, DArray.coalescing)`) : une fonction Go littérale
 * typée par le type **attendu** à cet endroit.
 */
export async function coalescingExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (TsAST.isCallExpression(node)) {
		return node.arguments.length === 1
			? translateWithData(node, coalescingOperation(context), context)
			: context.error(node, "coalescing-expects-one-argument");
	}

	const expectedType = TsAST.isExpression(node)
		? await context.transpilation.typeChecker.getContextualType(node)
		: undefined;

	if (!expectedType || !TsAST.isExpression(node)) {
		return context.error(node, "coalescing-as-value-needs-an-expected-type");
	}

	return translateFunctionValue(node, expectedType, coalescingOperation(context), context);
}
