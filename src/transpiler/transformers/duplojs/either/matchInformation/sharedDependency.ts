import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { eitherFieldIdentifiers } from "../core/sharedDependency";
import {
	argument,
	call,
	functionType,
	genericFunction,
	localEither,
	returnValue,
	select,
} from "../core/goFunction";

export const matchInformationIdentifier = GoAST.createIdentifier("MatchInformation");

/**
 * ```go
 * func MatchInformation[T any, U any](input Either[T], handlers []func(T) U) U {
 *     return handlers[input.Tag](input.Value)
 * }
 * ```
 * `handlers` est un slice indexé par numéro de tag
 * (`[]func(T) U{TagRightSuccess: f, TagLeftNegativeOperand: g}`) : pas de map,
 * un accès direct par index.
 */
export const matchInformationDependency = DCommon.memo(() => {
	const valueType = GoAST.createIdentifier("T");
	const outputType = GoAST.createIdentifier("U");
	const input = GoAST.createIdentifier("input");
	const handlers = GoAST.createIdentifier("handlers");

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			genericFunction({
				name: matchInformationIdentifier,
				generic: [valueType, outputType],
				arguments: [
					argument(input, localEither(valueType)),
					argument(handlers, GoAST.createSliceType({
						elementType: functionType([valueType], outputType),
					})),
				],
				returnType: outputType,
				statements: [
					returnValue(
						call(
							GoAST.createIndexExpression({
								target: handlers,
								index: select(input, eitherFieldIdentifiers.tag),
							}),
							[select(input, eitherFieldIdentifiers.value)],
						),
					),
				],
			}),
		],
	});
});
