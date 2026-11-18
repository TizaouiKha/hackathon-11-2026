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

export const rightThenIdentifier = GoAST.createIdentifier("RightThen");

/**
 * ```go
 * func RightThen[T any](input EitherAny, next func(T) EitherAny) EitherAny {
 *     if !input.Tag.IsRight() {
 *         return input
 *     }
 *     return next(input.Value.(T))
 * }
 * ```
 * `rightPipe(r, f, g)` devient `RightThen(RightThen(r, f), g)` : Go n'a pas de
 * génériques variadiques, d'où un helper à deux arguments, appelé en chaîne.
 * `T` est le type déclaré par l'étape TypeScript (inféré par Go, D-18).
 */
export const rightThenDependency = DCommon.memo(() => {
	const valueType = GoAST.createIdentifier("T");
	const input = GoAST.createIdentifier("input");
	const next = GoAST.createIdentifier("next");

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			genericFunction({
				name: rightThenIdentifier,
				generic: [valueType],
				arguments: [
					argument(input, localEitherAny),
					argument(next, functionType([valueType], localEitherAny)),
				],
				returnType: localEitherAny,
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
					returnValue(call(next, [assertType(select(input, eitherFieldIdentifiers.value), valueType)])),
				],
			}),
		],
	});
});
