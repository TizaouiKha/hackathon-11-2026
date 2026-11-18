import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import type { GoAST } from "@go";
import type { TsAST } from "@typescript";
import type { Type } from "typescript/async";
import type { BuildContext } from "../../../../context/build";
import { typeTransformers } from "../../../type";
import {
	createEitherGoType,
	resolveUnionVariants,
	unwrapParenthesizedType,
	type EitherGoValueType,
	type EitherVariant,
} from "./type";

/** Forme Go d'une valeur Either, lue depuis son type TypeScript. */
export interface EitherShape {
	readonly goType: GoAST.GenericTypeReference;

	/** `Either[T]` : une seule forme de valeur. `Either2[R, L]` : deux. */
	readonly kind: "either" | "either2";

	/** `T` pour `Either[T]`, `R` pour `Either2[R, L]`. */
	readonly rightValueType: EitherGoValueType;

	/** `T` pour `Either[T]`, `L` pour `Either2[R, L]`. */
	readonly leftValueType: EitherGoValueType;
	readonly variants: readonly EitherVariant[];
}

/** Type TS -> type Go, via les transformers de type. */
export async function transformTsType(type: Type, enclosing: TsAST.Node, context: BuildContext) {
	const typeNode = await context.transpilation.typeChecker.typeToTypeNode(type, enclosing);

	if (!typeNode) {
		return context.error(enclosing, "untranslatable-type");
	}

	const transformed = await DCommon.asyncPipe(
		context.transform(typeNode, typeTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(transformed)) {
		return transformed;
	}

	if (!DArray.lengthEqual(transformed.before, 0)) {
		return context.error(enclosing, "un-support-before-on-type");
	}

	return DEither.success(transformed.result);
}

/** Type Go de l'expression `node`, d'après le checker. */
export async function transformTypeOfNode(node: TsAST.Node, context: BuildContext) {
	const type = await context.transpilation.typeChecker.getTypeAtLocation(node);

	return transformTsType(type, node, context);
}

/** Lit la forme Either du type d'une expression ; erreur si ce n'est pas une union d'Either. */
export async function analyzeEitherOfNode(node: TsAST.Node, context: BuildContext) {
	return analyzeEitherOfType(
		await context.transpilation.typeChecker.getTypeAtLocation(node),
		node,
		context,
	);
}

/**
 * Lit la forme Either d'un type TS. `node` sert de contexte au checker et aux
 * messages d'erreur (utile quand le type ne vient pas d'une expression, par
 * exemple le paramètre d'une forme curryfiée).
 */
export async function analyzeEitherOfType(type: Type, node: TsAST.Node, context: BuildContext) {
	const typeNode = await context.transpilation.typeChecker.typeToTypeNode(type, node);

	if (!typeNode) {
		return context.error(node, "untranslatable-type");
	}

	const variants = await DCommon.asyncPipe(
		resolveUnionVariants(typeNode, context),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(variants)) {
		return DEither.hasInformation(variants, "none")
			? context.error(node, "expected-either-value")
			: variants;
	}

	const goType = await DCommon.asyncPipe(
		createEitherGoType(unwrapParenthesizedType(typeNode), variants, context),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(goType)) {
		return goType;
	}

	const [first, second] = goType.result.typeArguments;

	if (first === undefined) {
		return context.error(node, "either-type-without-value-type");
	}

	return DEither.success<EitherShape>({
		goType: goType.result,
		kind: second === undefined ? "either" : "either2",
		rightValueType: first,
		leftValueType: second ?? first,
		variants,
	});
}
