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

export const rightThenIdentifier = GoAST.createIdentifier("RightThen");

/**
 * ```go
 * func RightThen[T any](input Either[T], next func(T) Either[T]) Either[T] {
 *     if !input.Tag.IsRight() {
 *         return input
 *     }
 *     return next(input.Value)
 * }
 * ```
 * `rightPipe(r, f, g)` devient `RightThen(RightThen(r, f), g)` : Go n'a pas de
 * génériques variadiques, d'où un helper à deux arguments, appelé en chaîne.
 */
export const rightThenDependency = DCommon.memo(() => {
	const valueType = GoAST.createIdentifier("T");
	const input = GoAST.createIdentifier("input");
	const next = GoAST.createIdentifier("next");
	const eitherType = localEither(valueType);

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			genericFunction({
				name: rightThenIdentifier,
				generic: [valueType],
				arguments: [
					argument(input, eitherType),
					argument(next, functionType([valueType], eitherType)),
				],
				returnType: eitherType,
				statements: [
					GoAST.createIfStatement({
						condition: GoAST.createUnaryExpression({
							operator: "!",
							operand: isRightCall(input),
						}),
						body: GoAST.createBlockStatement({
							statements: [returnValue(input)],
						}),
					}),
					returnValue(call(next, [select(input, eitherFieldIdentifiers.value)])),
				],
			}),
		],
	});
});
