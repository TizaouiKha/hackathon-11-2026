import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DGenerator from "@duplojs/lang/generator";
import { type BuildContext } from "../../../../context/build";
import { analyzeEitherOfType, transformTsType } from "../core/analysis";
import { transformCallback } from "../core/callback";
import { functionType } from "../core/goFunction";
import { translateCurried, translateWithData, type EitherOperation } from "../core/operand";
import { registerEitherTag } from "../core/tag";
import { matchInformationDependency, matchInformationIdentifier } from "./sharedDependency";

function readPropertyName(property: TsAST.ObjectLiteralElementLike) {
	if (!TsAST.isPropertyAssignment(property)) {
		return undefined;
	}

	const { name } = property;

	return TsAST.isIdentifier(name) || TsAST.isStringLiteral(name)
		? name.text
		: undefined;
}

/**
 * Traduction de `matchInformation` pour une entrée donnée :
 * `shard_dependencies.MatchInformation(result, []func(any) U{TagLeftNegativeOperand: f, TagRightSuccess: g})`.
 * Chaque handler reçoit la valeur en `any` ; s'il attend un type précis, il est
 * enveloppé pour l'ouvrir avec ce type (D-18). Les issues peuvent donc porter
 * des valeurs de types différents.
 */
function matchInformationOperation(
	matcher: TsAST.ObjectLiteralExpression,
	context: BuildContext,
): EitherOperation {
	return async(operand, outputType) => {
		const shape = await DCommon.asyncPipe(
			analyzeEitherOfType(operand.type, operand.node, context),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(shape)) {
			return shape;
		}

		const outputGoType = await DCommon.asyncPipe(
			transformTsType(outputType, operand.node, context),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(outputGoType)) {
			return outputGoType;
		}

		// Les handlers sont traduits dans l'ordre d'écriture, pour préserver l'évaluation.
		const handlers = await DCommon.asyncPipe(
			matcher.properties,
			DGenerator.asyncReduce(
				DGenerator.reduceFrom<{
					before: readonly GoAST.Statement[];
					elements: readonly GoAST.KeyedElement<GoAST.ConstantExpression>[];
				}>({
					before: [],
					elements: [],
				}),
				async({ item, lastValue, next, exit }) => {
					const information = readPropertyName(item);
					const variant = information === undefined
						? undefined
						: DArray.find(shape.issues, (candidate) => candidate.information === information);

					if (!TsAST.isPropertyAssignment(item) || !variant) {
						return exit(context.error(item, "unsupported-match-information-handler"));
					}

					const handler = await DCommon.asyncPipe(
						transformCallback(
							{
								node: item.initializer,
								parameterTypes: [GoAST.builtinTypeReferences.any],
								returnType: outputGoType,
							},
							context,
						),
						DEither.unwrapRight,
					);

					if (DEither.isLeft(handler)) {
						return exit(handler);
					}

					return next({
						before: DArray.concat(lastValue.before, handler.before),
						elements: DArray.push(
							lastValue.elements,
							GoAST.createKeyedElement({
								key: registerEitherTag(context, variant.side, variant.information),
								value: handler.result,
							}),
						),
					});
				},
			),
		);

		if (DEither.isLeft(handlers)) {
			return handlers;
		}

		const packageName = context.registerSharedDependency(matchInformationDependency.value);

		return context.success({
			before: DArray.concat(operand.before, handlers.before),
			result: GoAST.createCallExpression({
				callee: GoAST.createSelectorExpression({
					target: packageName,
					identifier: matchInformationIdentifier,
				}),
				arguments: [
					operand.expression,
					GoAST.createSliceLiteral({
						typeReference: GoAST.createSliceType({
							elementType: functionType([GoAST.builtinTypeReferences.any], outputGoType),
						}),
						elements: handlers.elements,
					}),
				],
			}),
		});
	};
}

/**
 * `DEither.matchInformation(result, { … })` (avec données) ou
 * `DEither.matchInformation({ … })` (curryfiée : devient une fonction Go).
 */
export async function matchInformationExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node)) {
		return context.error(node, "match-information-must-be-called");
	}

	const matcher = DArray.last(node.arguments);

	if (!matcher || !TsAST.isObjectLiteralExpression(matcher)) {
		return context.error(node, "match-information-expects-an-object-literal");
	}

	if (node.arguments.length === 2) {
		return translateWithData(node, matchInformationOperation(matcher, context), context);
	}

	if (node.arguments.length === 1) {
		return translateCurried(node, matchInformationOperation(matcher, context), context);
	}

	return context.error(node, "match-information-expects-one-or-two-arguments");
}
