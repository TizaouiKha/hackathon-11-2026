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

export const whenIsRightIdentifier = GoAST.createIdentifier("WhenIsRight");

/**
 * ```go
 * func WhenIsRight[T any, V any](input EitherAny, onRight func(T) V) EitherAny {
 *     if input.Tag.IsRight() {
 *         return EitherAny{Tag: TagValue, Value: onRight(input.Value.(T))}
 *     }
 *     return input
 * }
 * ```
 * `whenIsRight` renvoie « valeur brute | erreur » (D-16) : la valeur brute est
 * rangée avec le tag réservé `TagValue`. Le handler enregistre `TagValue` avant
 * d'utiliser ce helper, pour que la constante existe.
 */
export const whenIsRightDependency = DCommon.memo(() => {
	const valueType = GoAST.createIdentifier("T");
	const rawType = GoAST.createIdentifier("V");
	const input = GoAST.createIdentifier("input");
	const onRight = GoAST.createIdentifier("onRight");
	const openedValue = assertType(select(input, eitherFieldIdentifiers.value), valueType);

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			genericFunction({
				name: whenIsRightIdentifier,
				generic: [valueType, rawType],
				arguments: [
					argument(input, localEitherAny),
					argument(onRight, functionType([valueType], rawType)),
				],
				returnType: localEitherAny,
				statements: [
					GoAST.createIfStatement({
						condition: isRightCall(input),
						body: GoAST.createBlockStatement({
							statements: [
								returnValue(GoAST.createStructLiteral({
									typeReference: localEitherAny,
									elements: [
										GoAST.createKeyedElement({
											key: eitherFieldIdentifiers.tag,
											value: GoAST.createIdentifier("TagValue"),
										}),
										GoAST.createKeyedElement({
											key: eitherFieldIdentifiers.value,
											value: call(onRight, [openedValue]),
										}),
									],
								})),
							],
						}),
					}),
					returnValue(input),
				],
			}),
		],
	});
});
