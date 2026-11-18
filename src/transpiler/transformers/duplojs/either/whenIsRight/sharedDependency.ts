import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { eitherFieldIdentifiers } from "../core/sharedDependency";
import {
	argument,
	call,
	functionType,
	genericFunction,
	isRightCall,
	localEither,
	returnValue,
	select,
} from "../core/goFunction";

export const whenIsRightIdentifier = GoAST.createIdentifier("WhenIsRight");

/**
 * ```go
 * func WhenIsRight[T any, V any, O any](
 *     input Either[T], onRight func(T) V, wrapValue func(V) O, wrapLeft func(Either[T]) O,
 * ) O {
 *     if input.Tag.IsRight() {
 *         return wrapValue(onRight(input.Value))
 *     }
 *     return wrapLeft(input)
 * }
 * ```
 * `whenIsRight` renvoie « valeur brute | erreur » (D-16). Le type de sortie `O`
 * dépend de l'union TypeScript : le transpileur génère `wrapValue` (qui range la
 * valeur avec `TagValue`) et `wrapLeft` (qui recopie l'erreur dans `O`).
 */
export const whenIsRightDependency = DCommon.memo(() => {
	const valueType = GoAST.createIdentifier("T");
	const rawType = GoAST.createIdentifier("V");
	const outputType = GoAST.createIdentifier("O");
	const input = GoAST.createIdentifier("input");
	const onRight = GoAST.createIdentifier("onRight");
	const wrapValue = GoAST.createIdentifier("wrapValue");
	const wrapLeft = GoAST.createIdentifier("wrapLeft");
	const inputType = localEither(valueType);

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			genericFunction({
				name: whenIsRightIdentifier,
				generic: [valueType, rawType, outputType],
				arguments: [
					argument(input, inputType),
					argument(onRight, functionType([valueType], rawType)),
					argument(wrapValue, functionType([rawType], outputType)),
					argument(wrapLeft, functionType([inputType], outputType)),
				],
				returnType: outputType,
				statements: [
					GoAST.createIfStatement({
						condition: isRightCall(input),
						body: GoAST.createBlockStatement({
							statements: [
								returnValue(
									call(wrapValue, [call(onRight, [select(input, eitherFieldIdentifiers.value)])]),
								),
							],
						}),
					}),
					returnValue(call(wrapLeft, [input])),
				],
			}),
		],
	});
});
