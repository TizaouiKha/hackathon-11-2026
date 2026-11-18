import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DGenerator from "@duplojs/lang/generator";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import type { Type } from "typescript/async";
import type { BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { eitherFieldIdentifiers } from "./sharedDependency";
import { registerEitherTag, type EitherSide } from "./tag";
import { eitherTypeHandler } from "./type";

function findEnclosingFunction(node: TsAST.Node): TsAST.SignatureDeclaration | undefined {
	const { parent } = node;

	if (!parent) {
		return undefined;
	}

	if (
		TsAST.isFunctionDeclaration(parent)
		|| TsAST.isFunctionExpression(parent)
		|| TsAST.isArrowFunction(parent)
		|| TsAST.isMethodDeclaration(parent)
	) {
		return parent;
	}

	return findEnclosingFunction(parent);
}

function isSameNode(left: TsAST.Node, right: TsAST.Node) {
	return left.pos === right.pos && left.end === right.end && left.kind === right.kind;
}

/**
 * Types candidats pour la valeur construite, du plus précis au plus général :
 * 1. en position de retour, le type de retour de la fonction englobante
 *    (inféré ou déclaré : `Fail | Success<number>`) ;
 * 2. le type contextuel donné par le checker ;
 * 3. le type propre de l'appel (`Fail`).
 * Ainsi `return DEither.fail()` produit le même type Go que le reste de la fonction.
 */
async function collectTargetTypes(call: TsAST.CallExpression, context: BuildContext) {
	const { typeChecker } = context.transpilation;
	const { parent } = call;

	const returnedFunction = DCommon.justExec(() => {
		if (parent && TsAST.isReturnStatement(parent)) {
			return findEnclosingFunction(parent);
		}

		if (parent && TsAST.isArrowFunction(parent) && isSameNode(parent.body, call)) {
			return parent;
		}

		return undefined;
	});

	const returnType = returnedFunction
		&& await typeChecker.getReturnTypeOfSignature(
			await typeChecker.getSignatureFromDeclaration(returnedFunction),
		);

	const contextualType = await typeChecker.getContextualType(call);
	const ownType = await typeChecker.getTypeAtLocation(call);

	return DArray.filter(
		[returnType, contextualType, ownType],
		(type): type is Type => type !== undefined,
	);
}

async function transformTargetType(type: Type, call: TsAST.CallExpression, context: BuildContext) {
	const typeNode = await context.transpilation.typeChecker.typeToTypeNode(type, call);

	if (!typeNode) {
		return context.notSupport();
	}

	return eitherTypeHandler(typeNode, context);
}

async function resolveTargetType(call: TsAST.CallExpression, context: BuildContext) {
	const candidates = await collectTargetTypes(call, context);

	return DCommon.asyncPipe(
		candidates,
		DGenerator.asyncReduce(
			DGenerator.reduceFrom<Awaited<ReturnType<typeof transformTargetType>>>(
				context.notSupport(),
			),
			async({ item, lastValue, next, exit }) => {
				const transformed = await transformTargetType(item, call, context);

				return DEither.hasInformation(transformed, "transformation-not-supported")
					? next(lastValue)
					: exit(transformed);
			},
		),
	);
}

export interface ConstructEitherParams {
	readonly call: TsAST.CallExpression;
	readonly side: EitherSide;
	readonly information: string;

	/** Expression TS de la valeur ; `undefined` pour `fail()` ou `left("x")`. */
	readonly value: TsAST.Expression | undefined;
}

/**
 * Traduit un constructeur DuploJS (`success`, `fail`, `left`) en littéral de
 * struct Go du type cible :
 * `shard_dependencies.Either[float64]{Tag: shard_dependencies.TagRightSuccess, Value: v}`.
 */
export async function constructEither(
	params: ConstructEitherParams,
	context: BuildContext,
) {
	const { call, side, information, value } = params;

	const targetType = await DCommon.asyncPipe(
		resolveTargetType(call, context),
		DEither.keepAsRightByInformation("transformation-success"),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(targetType)) {
		return DEither.hasInformation(targetType, "transformation-not-supported")
			? context.error(call, "unresolved-either-target-type")
			: targetType;
	}

	const valueExpression = value
		? await DCommon.asyncPipe(
			context.transform(value, expressionTransformers.value),
			DEither.unwrapRight,
		)
		: undefined;

	if (valueExpression && DEither.isLeft(valueExpression)) {
		return valueExpression;
	}

	const typeReference = targetType.result;
	// `Either2[R, L]` est le seul type Either à deux paramètres.
	const isEither2 = typeReference.typeArguments.length === 2;
	const valueField = DCommon.justExec(() => {
		if (!isEither2) {
			return eitherFieldIdentifiers.value;
		}

		return side === "right"
			? eitherFieldIdentifiers.right
			: eitherFieldIdentifiers.left;
	});

	const tagElement = GoAST.createKeyedElement({
		key: eitherFieldIdentifiers.tag,
		value: registerEitherTag(context, side, information),
	});

	return context.success({
		before: DArray.concat(
			targetType.before,
			valueExpression?.before ?? [],
		),
		result: GoAST.createStructLiteral({
			typeReference,
			elements: valueExpression
				? [
					tagElement,
					GoAST.createKeyedElement({
						key: valueField,
						value: valueExpression.result,
					}),
				]
				: [tagElement],
		}),
	});
}

/** Les constructeurs ne sont traduits qu'appelés : `DEither.success` seul n'a pas de type cible. */
export function requireCall(node: TsAST.Node, context: BuildContext) {
	return TsAST.isCallExpression(node)
		? DEither.success(node)
		: context.error(node, "either-constructor-used-as-value-not-supported");
}
