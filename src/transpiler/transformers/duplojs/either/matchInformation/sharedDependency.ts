import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { eitherFieldIdentifiers } from "../core/sharedDependency";
import {
	argument,
	call,
	functionType,
	genericFunction,
	localEitherAny,
	returnValue,
	select,
} from "../core/goFunction";

export const matchInformationIdentifier = GoAST.createIdentifier("MatchInformation");

/**
 * ```go
 * func MatchInformation[U any](input EitherAny, handlers []func(any) U) U {
 *     return handlers[input.Tag](input.Value)
 * }
 * ```
 * `handlers` est un slice indexé par numéro de tag
 * (`[]func(any) U{TagRightSuccess: f, TagLeftNegativeOperand: g}`) : accès direct
 * par index. Chaque issue peut porter une valeur d'un type différent : chaque
 * handler est enveloppé pour ouvrir la valeur avec **son** type (D-18).
 */
export const matchInformationDependency = DCommon.memo(() => {
	const outputType = GoAST.createIdentifier("U");
	const input = GoAST.createIdentifier("input");
	const handlers = GoAST.createIdentifier("handlers");

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			genericFunction({
				name: matchInformationIdentifier,
				generic: [outputType],
				arguments: [
					argument(input, localEitherAny),
					argument(handlers, GoAST.createSliceType({
						elementType: functionType([GoAST.builtinTypeReferences.any], outputType),
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
