import { type Transformer } from "@transformer";
import { GoAST, GoPrinter } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { SignatureKind } from "typescript/async";
import { type BuildContext } from "../../../../context/build";
import { analyzeEitherOfType, transformTsType, type EitherShape } from "../core/analysis";
import { transformCallback } from "../core/callback";
import { translateCurried, translateWithData, type EitherOperation } from "../core/operand";
import { eitherFieldIdentifiers } from "../core/sharedDependency";
import { registerEitherTag, valueInformation } from "../core/tag";
import { containsEitherType, type EitherGoValueType } from "../core/type";
import { whenIsRightDependency, whenIsRightIdentifier } from "./sharedDependency";

/** Type Go de la valeur renvoyée par le callback ; refuse un callback qui renvoie un Either. */
async function transformCallbackReturnType(callback: TsAST.Expression, context: BuildContext) {
	const { typeChecker } = context.transpilation;
	const signature = DArray.first(
		await typeChecker.getSignaturesOfType(
			await typeChecker.getTypeAtLocation(callback),
			SignatureKind.Call,
		),
	);

	if (!signature) {
		return context.error(callback, "callback-without-call-signature");
	}

	const returnType = await signature.getReturnType();
	const returnTypeNode = await typeChecker.typeToTypeNode(returnType, callback);

	if (returnTypeNode && await containsEitherType(returnTypeNode, context)) {
		return context.error(callback, "when-is-right-callback-returning-either-not-supported");
	}

	return transformTsType(returnType, callback, context);
}

/** Champ de `O` qui reçoit la valeur : `Value` pour `Either`, `Right` / `Left` pour `Either2`. */
function valueField(shape: EitherShape, side: "right" | "left") {
	if (shape.kind === "either") {
		return eitherFieldIdentifiers.value;
	}

	return side === "right"
		? eitherFieldIdentifiers.right
		: eitherFieldIdentifiers.left;
}

function wrapperFunction(
	parameter: GoAST.FunctionArgument,
	output: EitherShape,
	elements: readonly GoAST.KeyedElement<GoAST.Identifier>[],
) {
	return GoAST.createFunctionLiteral({
		arguments: [parameter],
		returnTypes: [output.goType],
		body: GoAST.createBlockStatement({
			statements: [
				GoAST.createReturnStatement({
					values: DCommon.cast([
						GoAST.createStructLiteral({
							typeReference: output.goType,
							elements,
						}),
					]),
				}),
			],
		}),
	});
}

/**
 * Traduction de `whenIsRight` pour une entrée donnée (D-16) :
 * - succès : `f(valeur)` est renvoyé **brut**, rangé avec `TagValue` ;
 * - sinon : l'erreur est renvoyée telle quelle.
 *
 * ```go
 * shard_dependencies.WhenIsRight(result, f,
 *     func(v V) O { return O{Tag: shard_dependencies.TagValue, Value: v} },
 *     func(l shard_dependencies.Either[T]) O { return O{Tag: l.Tag, Value: l.Value} },
 * )
 * ```
 */
function whenIsRightOperation(
	onRight: TsAST.Expression,
	context: BuildContext,
): EitherOperation {
	return async(operand, outputType) => {
		const inputShape = await DCommon.asyncPipe(
			analyzeEitherOfType(operand.type, operand.node, context),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(inputShape)) {
			return inputShape;
		}

		if (inputShape.kind !== "either") {
			return context.error(operand.node, "when-is-right-on-either2-not-supported");
		}

		const outputShape = await DCommon.asyncPipe(
			analyzeEitherOfType(outputType, operand.node, context),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(outputShape)) {
			return outputShape;
		}

		const rawType = await DCommon.asyncPipe(transformCallbackReturnType(onRight, context), DEither.unwrapRight);

		if (DEither.isLeft(rawType)) {
			return rawType;
		}

		// Une erreur qui porte une valeur doit pouvoir être recopiée telle quelle dans `O`.
		const inputLeftHasValue = DArray.some(
			inputShape.variants,
			(variant) => variant.side === "left" && variant.valueType !== undefined,
		);

		if (
			inputLeftHasValue
			&& GoPrinter.renderNode(inputShape.leftValueType) !== GoPrinter.renderNode(outputShape.leftValueType)
		) {
			return context.error(operand.node, "when-is-right-left-value-type-mismatch");
		}

		const onRightExpression = await DCommon.asyncPipe(
			transformCallback(
				{
					node: onRight,
					parameterTypes: [inputShape.rightValueType],
					returnType: rawType,
				},
				context,
			),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(onRightExpression)) {
			return onRightExpression;
		}

		const tagField = eitherFieldIdentifiers.tag;
		const valueParameter = GoAST.createFunctionArgument({
			identifier: context.generateIdentifier(),
			type: rawType as EitherGoValueType,
		});
		const leftParameter = GoAST.createFunctionArgument({
			identifier: context.generateIdentifier(),
			type: inputShape.goType,
		});

		const wrapValue = wrapperFunction(valueParameter, outputShape, [
			GoAST.createKeyedElement({
				key: tagField,
				value: registerEitherTag(context, "value", valueInformation),
			}),
			GoAST.createKeyedElement({
				key: valueField(outputShape, "right"),
				value: valueParameter.identifier,
			}),
		]);

		const wrapLeft = wrapperFunction(leftParameter, outputShape, [
			GoAST.createKeyedElement({
				key: tagField,
				value: GoAST.createSelectorExpression({
					target: leftParameter.identifier,
					identifier: tagField,
				}),
			}),
			...inputLeftHasValue
				? [
					GoAST.createKeyedElement({
						key: valueField(outputShape, "left"),
						value: GoAST.createSelectorExpression({
							target: leftParameter.identifier,
							identifier: eitherFieldIdentifiers.value,
						}),
					}),
				]
				: [],
		]);

		const packageName = context.registerSharedDependency(whenIsRightDependency.value);

		return context.success({
			before: DArray.concat(operand.before, onRightExpression.before),
			result: GoAST.createCallExpression({
				callee: GoAST.createSelectorExpression({
					target: packageName,
					identifier: whenIsRightIdentifier,
				}),
				arguments: [
					operand.expression,
					onRightExpression.result,
					wrapValue,
					wrapLeft,
				],
			}),
		});
	};
}

/**
 * `DEither.whenIsRight(result, f)` (avec données) ou `DEither.whenIsRight(f)`
 * (curryfiée, par exemple dans un `pipe` : devient une fonction Go).
 */
export async function whenIsRightExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node)) {
		return context.error(node, "when-is-right-must-be-called");
	}

	if (node.arguments.length === 2) {
		const [, onRight] = node.arguments as unknown as [TsAST.Expression, TsAST.Expression];

		return translateWithData(node, whenIsRightOperation(onRight, context), context);
	}

	if (node.arguments.length === 1) {
		const [onRight] = node.arguments as unknown as [TsAST.Expression];

		return translateCurried(node, whenIsRightOperation(onRight, context), context);
	}

	return context.error(node, "when-is-right-expects-one-or-two-arguments");
}
