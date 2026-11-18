import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { eitherFieldIdentifiers } from "../core/sharedDependency";
import {
	argument,
	isRightCall,
	localEitherAny,
	localEitherAnyLiteral,
	returnValue,
	select,
} from "../core/goFunction";

export const unwrapRightIdentifier = GoAST.createIdentifier("UnwrapRight");

/**
 * ```go
 * func UnwrapRight(input EitherAny) EitherAny {
 *     if input.Tag.IsRight() {
 *         return EitherAny{Tag: TagValue, Value: input.Value}
 *     }
 *     return input
 * }
 * ```
 * Utilisé quand le résultat reste une union (`number | Fail`) : la valeur
 * extraite devient une valeur brute (`TagValue`, D-16). Le handler enregistre
 * `TagValue` avant d'utiliser ce helper.
 */
export const unwrapRightDependency = DCommon.memo(() => {
	const input = GoAST.createIdentifier("input");

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: unwrapRightIdentifier,
				generic: [],
				arguments: [argument(input, localEitherAny)],
				returnTypes: [localEitherAny],
				body: GoAST.createBlockStatement({
					statements: [
						GoAST.createIfStatement({
							condition: isRightCall(input),
							body: GoAST.createBlockStatement({
								statements: [
									returnValue(localEitherAnyLiteral(
										GoAST.createIdentifier("TagValue"),
										select(input, eitherFieldIdentifiers.value),
									)),
								],
							}),
						}),
						returnValue(input),
					],
				}),
			}),
		],
	});
});
