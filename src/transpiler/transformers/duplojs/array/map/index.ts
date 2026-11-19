import { type Transformer } from "@transformer";
import { GoAST, GoPrinter } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { tsTypeToGo, type GoType } from "../../../type/tsTypeToGo";
import { transformCallback } from "../../either/core/callback";
import { translateCurried, translateWithData, type EitherOperation } from "../../either/core/operand";
import { mapDependency, mapIdentifier, mapParamsType } from "./sharedDependency";

/** Type des éléments d'une slice Go (`[]T` -> `T`) ; `undefined` si ce n'est pas une slice. */
function sliceElementType(type: GoType) {
	return "elementType" in type && GoPrinter.renderNode(type).startsWith("[]")
		? type.elementType
		: undefined;
}

/**
 * Traduction de `map` pour une entrée donnée :
 * `shard_dependencies.Map(input, theFunction)`. Le callback reçoit l'élément et
 * `{ index, self }` ; un callback qui en déclare moins (`DString.to`) est
 * enveloppé par `transformCallback`.
 */
function mapOperation(theFunction: TsAST.Expression, context: BuildContext): EitherOperation {
	return async(operand, outputType) => {
		const inputGoType = await DCommon.asyncPipe(
			tsTypeToGo(operand.type, operand.node, context),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(inputGoType)) {
			return inputGoType;
		}

		const outputGoType = await DCommon.asyncPipe(
			tsTypeToGo(outputType, operand.node, context),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(outputGoType)) {
			return outputGoType;
		}

		const elementType = sliceElementType(inputGoType);
		const outputElementType = sliceElementType(outputGoType);

		// Par exemple une union de tableaux d'éléments différents (`string[] | number[]`) : `any` en Go.
		if (!elementType || !outputElementType) {
			return context.error(operand.node, "map-expects-an-array-with-one-element-type");
		}

		const callback = await DCommon.asyncPipe(
			transformCallback(
				{
					node: theFunction,
					parameterTypes: [elementType, mapParamsType(inputGoType)],
					returnType: outputElementType,
				},
				context,
			),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(callback)) {
			return callback;
		}

		return context.success({
			before: DArray.concat(operand.before, callback.before),
			result: GoAST.createCallExpression({
				callee: GoAST.createSelectorExpression({
					target: context.registerSharedDependency(mapDependency.value),
					identifier: mapIdentifier,
				}),
				arguments: [operand.expression, callback.result],
			}),
		});
	};
}

/**
 * `DArray.map(array, f)` (avec données) ou `DArray.map(f)` (curryfiée, par
 * exemple dans un `pipe` : devient une fonction Go typée par le checker).
 */
export async function mapExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node)) {
		return context.error(node, "map-must-be-called");
	}

	if (node.arguments.length === 2) {
		const [, theFunction] = node.arguments as unknown as [TsAST.Expression, TsAST.Expression];

		return translateWithData(node, mapOperation(theFunction, context), context);
	}

	if (node.arguments.length === 1) {
		const [theFunction] = node.arguments as unknown as [TsAST.Expression];

		return translateCurried(node, mapOperation(theFunction, context), context);
	}

	return context.error(node, "map-expects-one-or-two-arguments");
}
