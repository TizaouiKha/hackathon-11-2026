import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import type { BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { undefinedShardDependency } from "../../../../sharedDependency/defaults";
import { eitherAnyTypeIdentifier, eitherCoreDependency, eitherFieldIdentifiers } from "./sharedDependency";
import { registerEitherTag, type EitherSide } from "./tag";

export interface ConstructEitherParams {
	readonly call: TsAST.CallExpression;
	readonly side: EitherSide;
	readonly information: string;

	/** Expression TS de la valeur ; `undefined` pour `fail()` ou `left("x")`. */
	readonly value: TsAST.Expression | undefined;
}

/** `shard_dependencies.JSUndefined{}` : la valeur d'une issue qui n'en porte pas. */
export function undefinedValue(context: BuildContext) {
	return GoAST.createStructLiteral({
		typeReference: GoAST.createPackageTypeReference({
			packageName: context.registerSharedDependency(undefinedShardDependency.value),
			identifier: GoAST.createIdentifier("JSUndefined"),
		}),
		elements: [],
	});
}

/**
 * Traduit un constructeur DuploJS (`success`, `fail`, `left`, `error`, `right`)
 * en littéral `EitherAny` (D-18) :
 * `shard_dependencies.EitherAny{Tag: shard_dependencies.TagRightSuccess, Value: v}`.
 * Toutes les unions ont le même type Go : pas de type cible à calculer.
 */
export async function constructEither(
	params: ConstructEitherParams,
	context: BuildContext,
) {
	const { side, information, value } = params;

	const valueExpression = value
		? await DCommon.asyncPipe(
			context.transform(value, expressionTransformers.value),
			DEither.unwrapRight,
		)
		: undefined;

	if (valueExpression && DEither.isLeft(valueExpression)) {
		return valueExpression;
	}

	const packageName = context.registerSharedDependency(eitherCoreDependency.value);

	return context.success({
		before: valueExpression?.before ?? [],
		result: GoAST.createStructLiteral({
			typeReference: GoAST.createPackageTypeReference({
				packageName,
				identifier: eitherAnyTypeIdentifier,
			}),
			elements: [
				GoAST.createKeyedElement({
					key: eitherFieldIdentifiers.tag,
					value: registerEitherTag(context, side, information),
				}),
				GoAST.createKeyedElement({
					key: eitherFieldIdentifiers.value,
					value: valueExpression?.result ?? undefinedValue(context),
				}),
			],
		}),
	});
}

/** Les constructeurs ne sont traduits qu'appelés : `DEither.success` seul n'est pas encore géré. */
export function requireCall(node: TsAST.Node, context: BuildContext) {
	return TsAST.isCallExpression(node)
		? DEither.success(node)
		: context.error(node, "either-constructor-used-as-value-not-supported");
}
