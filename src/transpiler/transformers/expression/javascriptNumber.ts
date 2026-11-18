import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

/**
 * Sémantique des nombres JavaScript qui n'existe pas telle quelle en Go.
 */

/** Import `math`, partagé : le `Set` des imports d'un fichier déduplique par identité. */
export const mathImportDeclaration = DCommon.memo(
	() => GoAST.createImportDeclaration({ path: "math" }),
);

export const bitwiseHelperIdentifiers = {
	and: GoAST.createIdentifier("JSBitwiseAnd"),
	or: GoAST.createIdentifier("JSBitwiseOr"),
	xor: GoAST.createIdentifier("JSBitwiseXor"),
	leftShift: GoAST.createIdentifier("JSLeftShift"),
	signedRightShift: GoAST.createIdentifier("JSSignedRightShift"),
	unsignedRightShift: GoAST.createIdentifier("JSUnsignedRightShift"),
} as const;

export type BitwiseOperation = keyof typeof bitwiseHelperIdentifiers;

const id = GoAST.createIdentifier;
const float64 = GoAST.builtinTypeReferences.float64;
const int32 = GoAST.builtinTypeReferences.int32;
const uint32 = GoAST.builtinTypeReferences.uint32;

function call(callee: GoAST.Expression, callArguments: readonly GoAST.Expression[]) {
	return GoAST.createCallExpression({
		callee,
		arguments: callArguments,
	});
}

function mathCall(name: string, callArguments: readonly GoAST.Expression[]) {
	return call(
		GoAST.createSelectorExpression({
			target: id("math"),
			identifier: id(name),
		}),
		callArguments,
	);
}

function convert(typeReference: GoAST.BuiltinTypeReference, operand: GoAST.Expression) {
	return GoAST.createConversionExpression({
		typeReference,
		operand,
	});
}

function binary(left: GoAST.Expression, operator: GoAST.BinaryOperator, right: GoAST.Expression) {
	return GoAST.createBinaryExpression({
		left,
		operator,
		right,
	});
}

function returnValue(value: GoAST.Expression) {
	return GoAST.createReturnStatement({ values: DCommon.cast([value]) });
}

function float(value: string) {
	return GoAST.createFloatLiteral({ value });
}

function functionDeclaration(
	name: GoAST.Identifier,
	parameters: readonly (readonly [string, GoAST.BuiltinTypeReference])[],
	returnType: GoAST.BuiltinTypeReference,
	statements: readonly GoAST.Statement[],
) {
	return GoAST.createFunctionDeclaration({
		identifier: name,
		generic: [],
		arguments: parameters.map(([parameterName, type]) => GoAST.createFunctionArgument({
			identifier: id(parameterName),
			type,
		})),
		returnTypes: [returnType],
		body: GoAST.createBlockStatement({ statements }),
	});
}

const toInt32Identifier = id("JSToInt32");
const toUint32Identifier = id("JSToUint32");
const twoPower32 = float("4294967296");

/**
 * ToUint32 (ECMAScript) : NaN et ±Infinity -> 0, sinon troncature puis modulo 2^32.
 * ```go
 * func JSToUint32(value float64) uint32 {
 *     if math.IsNaN(value) || math.IsInf(value, 0) { return 0 }
 *     truncated := math.Mod(math.Trunc(value), 4294967296)
 *     if truncated < 0 { truncated += 4294967296 }
 *     return uint32(truncated)
 * }
 * func JSToInt32(value float64) int32 { return int32(JSToUint32(value)) }
 * ```
 */
function toUint32Declaration() {
	const value = id("value");
	const truncated = id("truncated");

	return functionDeclaration(toUint32Identifier, [["value", float64]], uint32, [
		GoAST.createIfStatement({
			condition: binary(
				mathCall("IsNaN", [value]),
				"||",
				mathCall("IsInf", [value, GoAST.createIntegerLiteral({ value: 0n })]),
			),
			body: GoAST.createBlockStatement({
				statements: [returnValue(GoAST.createIntegerLiteral({ value: 0n }))],
			}),
		}),
		GoAST.createShortVariableDeclarationStatement({
			identifier: truncated,
			initializer: mathCall("Mod", [mathCall("Trunc", [value]), twoPower32]),
		}),
		GoAST.createIfStatement({
			condition: binary(truncated, "<", GoAST.createIntegerLiteral({ value: 0n })),
			body: GoAST.createBlockStatement({
				statements: [
					GoAST.createCompoundAssignmentStatement({
						target: truncated,
						operator: "+=",
						value: twoPower32,
					}),
				],
			}),
		}),
		returnValue(convert(uint32, truncated)),
	]);
}

function toInt32Declaration() {
	const body = returnValue(convert(int32, call(toUint32Identifier, [id("value")])));

	return functionDeclaration(toInt32Identifier, [["value", float64]], int32, [body]);
}

/** `func JSBitwiseAnd(left float64, right float64) float64 { return float64(JSToInt32(left) & JSToInt32(right)) }` */
function bitwiseDeclaration(name: GoAST.Identifier, operator: GoAST.BinaryOperator) {
	return functionDeclaration(name, [["left", float64], ["right", float64]], float64, [
		returnValue(convert(float64, binary(
			call(toInt32Identifier, [id("left")]),
			operator,
			call(toInt32Identifier, [id("right")]),
		))),
	]);
}

/**
 * Décalages : le nombre de positions est `ToUint32(right) & 31`, comme en JS.
 * `>>>` décale un **uint32** (remplissage par des zéros), `<<` et `>>` un int32.
 */
function shiftDeclaration(
	name: GoAST.Identifier,
	operator: GoAST.BinaryOperator,
	leftConversion: GoAST.Identifier,
) {
	return functionDeclaration(name, [["left", float64], ["right", float64]], float64, [
		returnValue(convert(float64, binary(
			call(leftConversion, [id("left")]),
			operator,
			binary(call(toUint32Identifier, [id("right")]), "&", GoAST.createIntegerLiteral({ value: 31n })),
		))),
	]);
}

/**
 * Opérateurs binaires sur les bits (`&`, `|`, `^`, `<<`, `>>`, `>>>`) :
 * JavaScript convertit les opérandes en entiers 32 bits, Go refuse ces
 * opérateurs sur des `float64`. Un helper par opérateur, qui renvoie un `float64`.
 */
export const javascriptBitwiseDependency = DCommon.memo(() => createSharedDependency({
	imports: [mathImportDeclaration.value],
	init: [],
	declarations: [
		toUint32Declaration(),
		toInt32Declaration(),
		bitwiseDeclaration(bitwiseHelperIdentifiers.and, "&"),
		bitwiseDeclaration(bitwiseHelperIdentifiers.or, "|"),
		bitwiseDeclaration(bitwiseHelperIdentifiers.xor, "^"),
		shiftDeclaration(bitwiseHelperIdentifiers.leftShift, "<<", toInt32Identifier),
		shiftDeclaration(bitwiseHelperIdentifiers.signedRightShift, ">>", toInt32Identifier),
		shiftDeclaration(bitwiseHelperIdentifiers.unsignedRightShift, ">>", toUint32Identifier),
	],
}));
