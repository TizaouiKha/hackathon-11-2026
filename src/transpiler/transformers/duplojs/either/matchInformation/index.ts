import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DGenerator from "@duplojs/lang/generator";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { analyzeEitherOfNode, transformTypeOfNode } from "../core/analysis";
import { transformCallback } from "../core/callback";
import { functionType } from "../core/goFunction";
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
 * `DEither.matchInformation(result, { "negative-operand": f, success: g })`
 * -> `shard_dependencies.MatchInformation(result, []func(float64) U{TagLeftNegativeOperand: f, TagRightSuccess: g})`.
 * Limite : seulement pour `Either[T]` (tous les handlers reçoivent le même type).
 */
export async function matchInformationExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node) || node.arguments.length !== 2) {
		return context.error(node, "match-information-expects-two-arguments");
	}

	const [input, matcher] = node.arguments as unknown as [TsAST.Expression, TsAST.Expression];

	if (!TsAST.isObjectLiteralExpression(matcher)) {
		return context.error(matcher, "match-information-expects-an-object-literal");
	}

	const shape = await DCommon.asyncPipe(analyzeEitherOfNode(input, context), DEither.unwrapRight);

	if (DEither.isLeft(shape)) {
		return shape;
	}

	if (shape.kind !== "either") {
		return context.error(node, "match-information-on-either2-not-supported");
	}

	const outputType = await DCommon.asyncPipe(transformTypeOfNode(node, context), DEither.unwrapRight);

	if (DEither.isLeft(outputType)) {
		return outputType;
	}

	const inputExpression = await DCommon.asyncPipe(
		context.transform(input, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(inputExpression)) {
		return inputExpression;
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
					: DArray.find(shape.variants, (candidate) => candidate.information === information);

				if (!TsAST.isPropertyAssignment(item) || !variant) {
					return exit(context.error(item, "unsupported-match-information-handler"));
				}

				const handler = await DCommon.asyncPipe(
					transformCallback(
						{
							node: item.initializer,
							parameterTypes: [shape.rightValueType],
							returnType: outputType,
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
		before: DArray.concat(inputExpression.before, handlers.before),
		result: GoAST.createCallExpression({
			callee: GoAST.createSelectorExpression({
				target: packageName,
				identifier: matchInformationIdentifier,
			}),
			arguments: [
				inputExpression.result,
				GoAST.createSliceLiteral({
					typeReference: GoAST.createSliceType({
						elementType: functionType([shape.rightValueType], outputType),
					}),
					elements: handlers.elements,
				}),
			],
		}),
	});
}
