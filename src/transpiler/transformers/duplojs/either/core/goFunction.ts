import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { eitherAnyTypeIdentifier, eitherFieldIdentifiers } from "./sharedDependency";

/**
 * Petits constructeurs pour écrire les helpers Go génériques du domaine Either
 * (D-09.3) dans le package `shard_dependencies`. Ils produisent des nœuds de
 * l'AST Go existant ; ils ne servent qu'aux shared dependencies de ce domaine.
 */

export type GoTypeNode = GoAST.TypeReference | GoAST.Type;

export function typeParameter(identifier: GoAST.Identifier) {
	return GoAST.createTypeParameter({
		identifier,
		constraint: GoAST.builtinTypeReferences.any,
	});
}

/** `EitherAny`, dans le package `shard_dependencies` (D-18). */
export const localEitherAny = eitherAnyTypeIdentifier;

/** `EitherAny{Tag: tag, Value: value}`, dans le package `shard_dependencies`. */
export function localEitherAnyLiteral(tag: GoAST.Expression, value: GoAST.Expression) {
	return GoAST.createStructLiteral({
		typeReference: eitherAnyTypeIdentifier,
		elements: [
			GoAST.createKeyedElement({
				key: eitherFieldIdentifiers.tag,
				value: tag,
			}),
			GoAST.createKeyedElement({
				key: eitherFieldIdentifiers.value,
				value,
			}),
		],
	});
}

/** `value.(T)` : lecture typée d'une valeur rangée dans un `any`. */
export function assertType(value: GoAST.Expression, type: GoTypeNode) {
	return GoAST.createTypeAssertionExpression({
		target: value,
		typeReference: type,
	});
}

export function argument(identifier: GoAST.Identifier, type: GoTypeNode) {
	return GoAST.createFunctionArgument({
		identifier,
		type,
	});
}

/** `func(T) U` */
export function functionType(parameterTypes: readonly GoTypeNode[], returnType: GoTypeNode) {
	return GoAST.createFunctionType({
		arguments: parameterTypes.map((type, index) => argument(GoAST.createIdentifier(`p${index}`), type)),
		returnTypes: [returnType],
	});
}

export function select(target: GoAST.Expression, identifier: GoAST.Identifier) {
	return GoAST.createSelectorExpression({
		target,
		identifier,
	});
}

export function call(callee: GoAST.Expression, callArguments: readonly GoAST.Expression[]) {
	return GoAST.createCallExpression({
		callee,
		arguments: callArguments,
	});
}

export function returnValue(value: GoAST.Expression) {
	return GoAST.createReturnStatement({
		values: DCommon.cast([value]),
	});
}

/** `input.Tag.IsRight()` */
export function isRightCall(input: GoAST.Expression) {
	return call(
		select(select(input, eitherFieldIdentifiers.tag), GoAST.createIdentifier("IsRight")),
		[],
	);
}

export interface GenericFunctionParams {
	readonly name: GoAST.Identifier;
	readonly generic: readonly GoAST.Identifier[];
	readonly arguments: readonly GoAST.FunctionArgument[];
	readonly returnType: GoTypeNode;
	readonly statements: readonly GoAST.Statement[];
}

export function genericFunction(params: GenericFunctionParams) {
	return GoAST.createFunctionDeclaration({
		identifier: params.name,
		generic: params.generic.map(typeParameter),
		arguments: params.arguments,
		returnTypes: [params.returnType],
		body: GoAST.createBlockStatement({ statements: params.statements }),
	});
}
