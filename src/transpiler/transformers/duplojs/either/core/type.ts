import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST, GoPrinter } from "@go";
import { TsAST } from "@typescript";
import type { BuildContext } from "../../../../context/build";
import { typeTransformers } from "../../../type";
import { registerEitherTag, type EitherSide } from "./tag";
import { either2TypeIdentifier, eitherCoreDependency, eitherTypeIdentifier } from "./sharedDependency";

export type EitherGoValueType = GoAST.TypeReference | GoAST.Type;

export interface EitherVariant {
	readonly side: EitherSide;
	readonly information: string;

	/** `undefined` lorsque la variante ne porte pas de valeur (`Fail`, `Left<"x">`). */
	readonly valueType: EitherGoValueType | undefined;
}

export type EitherMemberNode = TsAST.TypeReferenceNode | TsAST.ImportTypeNode;

export function isEitherMemberCandidate(node: TsAST.Node): node is EitherMemberNode {
	return TsAST.isTypeReferenceNode(node) || TsAST.isImportTypeNode(node);
}

/** Retire les parenthèses de type : `(A | B)` devient `A | B`. */
export function unwrapParenthesizedType(node: TsAST.TypeNode): TsAST.TypeNode {
	return TsAST.isParenthesizedTypeNode(node)
		? unwrapParenthesizedType(node.type)
		: node;
}

/** Résout le nom de l'export DuploJS Either désigné par un nœud de type, sans rien enregistrer. */
export async function resolveEitherTypeName(node: EitherMemberNode, context: BuildContext) {
	const reference = TsAST.isTypeReferenceNode(node) ? node.typeName : node;

	const moduleReference = await DCommon.asyncPipe(
		context.resolveReferenceModule(reference, "@duplojs/lang", /^dist\/either\//),
		DEither.unwrapRight,
	);

	return DEither.isLeft(moduleReference)
		? undefined
		: moduleReference.symbol.name;
}

// Les génériques `const` de DuploJS produisent des littéraux (`Left<"x", 0>`) :
// la valeur Go porte le type élargi (`0` -> number -> float64).
function widenLiteralTypeNode(node: TsAST.TypeNode): TsAST.TypeNode {
	if (!TsAST.isLiteralTypeNode(node)) {
		return node;
	}

	const { literal } = node;

	if (TsAST.isNumericLiteral(literal) || TsAST.isPrefixUnaryExpression(literal)) {
		return TsAST.factory.createKeywordTypeNode(TsAST.SyntaxKind.NumberKeyword);
	}

	if (TsAST.isStringLiteral(literal)) {
		return TsAST.factory.createKeywordTypeNode(TsAST.SyntaxKind.StringKeyword);
	}

	if (literal.kind === TsAST.SyntaxKind.TrueKeyword || literal.kind === TsAST.SyntaxKind.FalseKeyword) {
		return TsAST.factory.createKeywordTypeNode(TsAST.SyntaxKind.BooleanKeyword);
	}

	return node;
}

async function transformValueType(
	node: TsAST.TypeNode | undefined,
	context: BuildContext,
) {
	if (
		!node
		|| node.kind === TsAST.SyntaxKind.UndefinedKeyword
		|| node.kind === TsAST.SyntaxKind.VoidKeyword
	) {
		return DEither.success(undefined);
	}

	const transformed = await DCommon.asyncPipe(
		context.transform(widenLiteralTypeNode(node), typeTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(transformed)) {
		return transformed;
	}

	if (!DArray.lengthEqual(transformed.before, 0)) {
		return context.error(node, "un-support-before-on-either-value-type");
	}

	return DEither.success<EitherGoValueType | undefined>(transformed.result);
}

function readInformation(
	node: EitherMemberNode,
	context: BuildContext,
) {
	const informationNode = node.typeArguments && DArray.first(node.typeArguments);

	if (
		!informationNode
		|| !TsAST.isLiteralTypeNode(informationNode)
		|| !TsAST.isStringLiteral(informationNode.literal)
	) {
		return context.error(node, "either-information-must-be-a-string-literal");
	}

	return DEither.success(informationNode.literal.text);
}

/**
 * Lit une variante (`Success<T>`, `Fail`, `Left<"info", T>`, `Right<"info", T>`).
 * Retourne `none` si le nœud n'est pas un type Either de DuploJS.
 */
export async function resolveEitherVariant(
	node: EitherMemberNode,
	context: BuildContext,
) {
	const name = await resolveEitherTypeName(node, context);
	const typeArguments = node.typeArguments ?? [];

	const description = DCommon.justExec(() => {
		if (name === "Success") {
			return DEither.success({
				side: "right" as const,
				information: "success",
				valueNode: DArray.first(typeArguments),
			});
		}

		if (name === "Fail") {
			return DEither.success({
				side: "left" as const,
				information: "fail",
				valueNode: undefined,
			});
		}

		if (name === "Left" || name === "Right") {
			return DEither.rightPipe(
				readInformation(node, context),
				(information) => DEither.success({
					side: name === "Left" ? "left" as const : "right" as const,
					information,
					valueNode: DArray.at(typeArguments, 1),
				}),
			);
		}

		return DEither.none();
	});

	if (DEither.isLeft(description)) {
		return description;
	}

	const { side, information, valueNode } = DEither.unwrapRight(description);
	const valueType = await DCommon.asyncPipe(
		transformValueType(valueNode, context),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(valueType)) {
		return valueType;
	}

	return DEither.some<EitherVariant>({
		side,
		information,
		valueType,
	});
}

function distinctTypes(types: readonly EitherGoValueType[]) {
	return DArray.reduce(
		types,
		DArray.reduceFrom<{
			keys: readonly string[];
			types: readonly EitherGoValueType[];
		}>({
			keys: [],
			types: [],
		}),
		({ element, lastValue, next }) => {
			const key = GoPrinter.renderNode(element);

			return DArray.includes(lastValue.keys, key)
				? next(lastValue)
				: next({
					keys: DArray.push(lastValue.keys, key),
					types: DArray.push(lastValue.types, element),
				});
		},
	).types;
}

function collectValueTypes(variants: readonly EitherVariant[], side: EitherSide) {
	return distinctTypes(
		DArray.flatMap(
			variants,
			(variant) => variant.side === side && variant.valueType
				? [variant.valueType]
				: [],
		),
	);
}

/**
 * Construit le type Go d'une union d'Either selon la règle D-09.2 :
 * - une seule forme de valeur (ou aucune) -> `Either[T]` ;
 * - une forme à droite et une autre à gauche -> `Either2[R, L]` ;
 * - sinon, refus explicite.
 * `Fail` / `undefined` est compatible avec toutes les formes.
 */
export function createEitherGoType(
	node: TsAST.Node,
	variants: readonly EitherVariant[],
	context: BuildContext,
) {
	const rightTypes = collectValueTypes(variants, "right");
	const leftTypes = collectValueTypes(variants, "left");
	const allTypes = distinctTypes(DArray.concat(rightTypes, leftTypes));

	if (allTypes.length > 1 && (rightTypes.length > 1 || leftTypes.length > 1)) {
		return context.error(node, "unsupported-either-mixed-value-types");
	}

	const packageName = context.registerSharedDependency(eitherCoreDependency.value);

	for (const variant of variants) {
		registerEitherTag(context, variant.side, variant.information);
	}

	const undefinedType = GoAST.createPackageTypeReference({
		packageName,
		identifier: GoAST.createIdentifier("JSUndefined"),
	});

	const rightType: EitherGoValueType = DArray.first(rightTypes) ?? undefinedType;
	const leftType: EitherGoValueType = DArray.first(leftTypes) ?? undefinedType;

	if (allTypes.length > 1) {
		return context.success({
			result: GoAST.createGenericTypeReference({
				typeReference: GoAST.createPackageTypeReference({
					packageName,
					identifier: either2TypeIdentifier,
				}),
				typeArguments: DCommon.cast([rightType, leftType]),
			}),
		});
	}

	return context.success({
		result: GoAST.createGenericTypeReference({
			typeReference: GoAST.createPackageTypeReference({
				packageName,
				identifier: eitherTypeIdentifier,
			}),
			typeArguments: DCommon.cast([DArray.first(allTypes) ?? undefinedType]),
		}),
	});
}

/**
 * Handler de type : une union (ou un membre seul) dont chaque membre est un
 * type Either de DuploJS. Retourne `notSupport` si un membre n'en est pas un.
 */
export async function eitherTypeHandler(
	node: TsAST.TypeNode,
	members: readonly EitherMemberNode[],
	context: BuildContext,
) {
	const variants = await DCommon.asyncPipe(
		members,
		DArray.map((member) => resolveEitherVariant(member, context)),
		DCommon.promiseAll,
		DArray.reduce(
			DArray.reduceFrom<readonly EitherVariant[]>([]),
			({ element, lastValue, next, exit }) => {
				if (DEither.isLeft(element)) {
					return exit(element);
				}

				return next(DArray.push(lastValue, DEither.unwrapRight(element)));
			},
		),
	);

	if (DEither.isLeft(variants)) {
		return DEither.hasInformation(variants, "none")
			? context.notSupport()
			: variants;
	}

	return createEitherGoType(node, variants, context);
}
