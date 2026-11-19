import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { eitherFieldIdentifiers } from "../core/sharedDependency";
import {
	argument,
	assertType,
	call,
	functionType,
	genericFunction,
	isRightCall,
	localEitherAny,
	returnValue,
	select,
} from "../core/goFunction";

export const whenIsRightOtherwiseIdentifier = GoAST.createIdentifier("WhenIsRightOtherwise");

/**
 * ```go
 * func WhenIsRightOtherwise[T any, U any](input EitherAny, onRight func(T) U, otherwise func(EitherAny) U) U {
 *     if input.Tag.IsRight() {
 *         return onRight(input.Value.(T))
 *     }
 *     return otherwise(input)
 * }
 * ```
 * `T` est le type que le callback TypeScript déclare (inféré par Go) : l'assertion
 * ouvre la valeur `any`, dont le type a déjà été vérifié par TypeScript (D-18).
 */
export const whenIsRightOtherwiseDependency = DCommon.memo(() => {
	const valueType = GoAST.createIdentifier("T");
	const outputType = GoAST.createIdentifier("U");
	const input = GoAST.createIdentifier("input");
	const onRight = GoAST.createIdentifier("onRight");
	const otherwise = GoAST.createIdentifier("otherwise");
	const openedValue = assertType(select(input, eitherFieldIdentifiers.value), valueType);

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			genericFunction({
				name: whenIsRightOtherwiseIdentifier,
				generic: [valueType, outputType],
				arguments: [
					argument(input, localEitherAny),
					argument(onRight, functionType([valueType], outputType)),
					argument(otherwise, functionType([localEitherAny], outputType)),
				],
				returnType: outputType,
				statements: [
					GoAST.createIfStatement({
						condition: isRightCall(input),
						body: GoAST.createBlockStatement({
							statements: [returnValue(call(onRight, [openedValue]))],
						}),
					}),
					returnValue(call(otherwise, [input])),
				],
			}),
		],
	});
});
