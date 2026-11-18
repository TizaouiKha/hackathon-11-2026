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
	localEither2,
	returnValue,
	select,
} from "../core/goFunction";

export const whenIsRightOtherwiseIdentifier = GoAST.createIdentifier("WhenIsRightOtherwise");
export const whenIsRightOtherwise2Identifier = GoAST.createIdentifier("WhenIsRightOtherwise2");

/**
 * ```go
 * func WhenIsRightOtherwise[T any, U any](input Either[T], onRight func(T) U, otherwise func(Either[T]) U) U {
 *     if input.Tag.IsRight() {
 *         return onRight(input.Value)
 *     }
 *     return otherwise(input)
 * }
 * // WhenIsRightOtherwise2 : même chose pour Either2[R, L] (onRight reçoit input.Right).
 * ```
 */
export const whenIsRightOtherwiseDependency = DCommon.memo(() => {
	const [valueType, rightType, leftType, outputType] = ["T", "R", "L", "U"].map(GoAST.createIdentifier) as [
		GoAST.Identifier,
		GoAST.Identifier,
		GoAST.Identifier,
		GoAST.Identifier,
	];
	const input = GoAST.createIdentifier("input");
	const onRight = GoAST.createIdentifier("onRight");
	const otherwise = GoAST.createIdentifier("otherwise");

	function create(params: {
		name: GoAST.Identifier;
		generic: readonly GoAST.Identifier[];
		inputType: GoAST.GenericTypeReference;
		onRightValueType: GoAST.Identifier;
		valueField: GoAST.Identifier;
	}) {
		const { name, generic, inputType, onRightValueType, valueField } = params;

		return genericFunction({
			name,
			generic,
			arguments: [
				argument(input, inputType),
				argument(onRight, functionType([onRightValueType], outputType)),
				argument(otherwise, functionType([inputType], outputType)),
			],
			returnType: outputType,
			statements: [
				GoAST.createIfStatement({
					condition: isRightCall(input),
					body: GoAST.createBlockStatement({
						statements: [returnValue(call(onRight, [select(input, valueField)]))],
					}),
				}),
				returnValue(call(otherwise, [input])),
			],
		});
	}

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			create({
				name: whenIsRightOtherwiseIdentifier,
				generic: [valueType, outputType],
				inputType: localEither(valueType),
				onRightValueType: valueType,
				valueField: eitherFieldIdentifiers.value,
			}),
			create({
				name: whenIsRightOtherwise2Identifier,
				generic: [rightType, leftType, outputType],
				inputType: localEither2(rightType, leftType),
				onRightValueType: rightType,
				valueField: eitherFieldIdentifiers.right,
			}),
		],
	});
});
