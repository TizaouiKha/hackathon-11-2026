import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { lowerCaseExpansions, upperCaseExpansions } from "./caseMapping";

/**
 * Chaînes JavaScript en Go (DECISIONS.md D-18.4).
 *
 * Une `string` Go contient de l'UTF-8 ; JavaScript compte en **unités UTF-16**
 * (`"é".length === 1`, `"😀".length === 2`). Les fonctions qui manipulent des
 * positions convertissent donc entre unités UTF-16 et octets. Celles qui n'en
 * manipulent pas (`includes`, `startsWith`, `endsWith`) donnent le même résultat
 * directement sur l'UTF-8 et appellent `strings` sans conversion.
 *
 * ```go
 * func JSStringLength(value string) float64           // unités UTF-16
 * func JSStringSlice(value string, start, end float64) string
 * func JSStringSubstring(value string, start float64, end ...float64) string
 * func JSStringCharAt(value string, index float64) string
 * func JSStringAt(value string, index float64) any     // string ou JSUndefined
 * func JSStringIndexOf(value, search string, position ...float64) any // float64 ou JSUndefined
 * func JSStringIncludes / JSStringStartsWith / JSStringEndsWith(value, search string) bool
 * func JSStringToUpperCase / JSStringToLowerCase(value string) string
 * ```
 */

const id = GoAST.createIdentifier;
const { bool, float64, int, string, any } = GoAST.builtinTypeReferences;

function integer(value: number) {
	return GoAST.createIntegerLiteral({ value: BigInt(value) });
}

function text(value: string) {
	return GoAST.createStringLiteral({ value });
}

function binary(left: GoAST.Expression, operator: GoAST.BinaryOperator, right: GoAST.Expression) {
	return GoAST.createBinaryExpression({
		left,
		operator,
		right,
	});
}

function call(callee: string, callArguments: readonly GoAST.Expression[], packageName?: string) {
	return GoAST.createCallExpression({
		callee: packageName === undefined
			? id(callee)
			: GoAST.createSelectorExpression({
				target: id(packageName),
				identifier: id(callee),
			}),
		arguments: callArguments,
	});
}

function convert(type: GoAST.BuiltinTypeReference, value: GoAST.Expression) {
	return GoAST.createConversionExpression({
		typeReference: type,
		operand: value,
	});
}

function block(statements: readonly GoAST.Statement[]) {
	return GoAST.createBlockStatement({ statements });
}

function returnValue(value: GoAST.Expression) {
	return GoAST.createReturnStatement({ values: DCommon.cast([value]) });
}

function when(condition: GoAST.Expression, statements: readonly GoAST.Statement[]) {
	return GoAST.createIfStatement({
		condition,
		body: block(statements),
	});
}

function declare(name: string, initializer: GoAST.Expression) {
	return GoAST.createShortVariableDeclarationStatement({
		identifier: id(name),
		initializer,
	});
}

function assign(name: string, value: GoAST.Expression) {
	return GoAST.createAssignmentStatement({
		targets: DCommon.cast([id(name)]),
		values: DCommon.cast([value]),
	});
}

function increment(name: string) {
	return GoAST.createCompoundAssignmentStatement({
		operator: "+=",
		target: id(name),
		value: integer(1),
	});
}

function parameter(name: string, type: GoAST.TypeReference | GoAST.Type) {
	return GoAST.createFunctionArgument({
		identifier: id(name),
		type,
	});
}

interface FunctionParams {
	readonly name: string;
	readonly parameters: readonly GoAST.FunctionArgument[];
	readonly variadic?: GoAST.FunctionArgument;
	readonly returnType: GoAST.TypeReference | GoAST.Type;
	readonly statements: readonly GoAST.Statement[];
}

function goFunction(params: FunctionParams) {
	return GoAST.createFunctionDeclaration({
		identifier: id(params.name),
		generic: [],
		arguments: params.parameters,
		variadicArgument: params.variadic,
		returnTypes: [params.returnType],
		body: block(params.statements),
	});
}

/** `jsStringUnits(value, length, from, to)` : unités UTF-16 `[from, to)`. */
function unitSlice(from: GoAST.Expression, to: GoAST.Expression) {
	return call("jsStringUnits", [id("value"), id("length"), from, to]);
}

/** `length := int(JSStringLength(value))` */
const declareLength = declare("length", convert(int, call("JSStringLength", [id("value")])));

/** Unités UTF-16 d'un caractère : 2 au-delà du plan de base (`character >= 0x10000`). */
function countUnit(counter: string) {
	return [
		increment(counter),
		when(binary(id("character"), ">=", integer(0x10000)), [increment(counter)]),
	];
}

function forEachCharacter(indexName: string, statements: readonly GoAST.Statement[]) {
	return GoAST.createRangeStatement({
		binding: GoAST.createRangeDeclaration({
			key: id(indexName),
			value: id("character"),
		}),
		expression: id("value"),
		body: block(statements),
	});
}

/**
 * Longueur en unités UTF-16, en **un seul parcours des octets**, sans décoder :
 * chaque octet de tête (ASCII ou `>= 0xC0`) compte 1, et un octet de tête de
 * 4 octets (`>= 0xF0`, hors du plan de base) compte 1 de plus (paire UTF-16).
 * ```go
 * func JSStringLength(value string) float64 {
 *     units := 0
 *     for index := 0; index < len(value); index += 1 {
 *         if value[index] < 0x80 || value[index] >= 0xC0 { units += 1 }
 *         if value[index] >= 0xF0 { units += 1 }
 *     }
 *     return float64(units)
 * }
 * ```
 */
function lengthFunction() {
	const byte = GoAST.createIndexExpression({
		target: id("value"),
		index: id("index"),
	});

	return goFunction({
		name: "JSStringLength",
		parameters: [parameter("value", string)],
		returnType: float64,
		statements: [
			declare("units", integer(0)),
			GoAST.createForStatement({
				initializer: declare("index", integer(0)),
				condition: binary(id("index"), "<", call("len", [id("value")])),
				post: increment("index"),
				body: block([
					when(
						binary(binary(byte, "<", integer(0x80)), "||", binary(byte, ">=", integer(0xC0))),
						[increment("units")],
					),
					when(binary(byte, ">=", integer(0xF0)), [increment("units")]),
				]),
			}),
			returnValue(convert(float64, id("units"))),
		],
	});
}

/** Octet où commence l'unité UTF-16 `unit` (borné à `len(value)`). */
function offsetFunction() {
	return goFunction({
		name: "jsStringOffset",
		parameters: [parameter("value", string), parameter("unit", int)],
		returnType: int,
		statements: [
			declare("units", integer(0)),
			forEachCharacter("index", [
				when(binary(id("units"), ">=", id("unit")), [returnValue(id("index"))]),
				...countUnit("units"),
			]),
			returnValue(call("len", [id("value")])),
		],
	});
}

/** `size := 1 ; if character >= 0x10000 { size = 2 }` */
const declareSize = [
	declare("size", integer(1)),
	when(binary(id("character"), ">=", integer(0x10000)), [assign("size", integer(2))]),
];

/**
 * Unités UTF-16 `[from, to)` de `value`, **sans copie** tant qu'aucune paire
 * UTF-16 n'est coupée : on cherche les octets de début et de fin, puis
 * `value[start:end]` partage la mémoire de `value`.
 * ```go
 * func jsStringUnits(value string, length int, from int, to int) string {
 *     if from >= to { return "" }
 *     if len(value) == length { return value[from:to] } // ASCII
 *     start := -1
 *     end := len(value)
 *     split := false
 *     units := 0
 *     for index, character := range value {
 *         if units >= to { end = index; break }
 *         size := 1
 *         if character >= 0x10000 { size = 2 }
 *         if start < 0 && units+size > from { start = index; split = units < from }
 *         if units+size > to { split = true }
 *         units += size
 *     }
 *     if !split { return value[start:end] }
 *     return jsStringSplitUnits(value, from, to) // une paire est coupée
 * }
 * ```
 */
function unitsFunction() {
	const units = id("units");
	const unitsAfter = binary(units, "+", id("size"));

	return goFunction({
		name: "jsStringUnits",
		parameters: [
			parameter("value", string),
			parameter("length", int),
			parameter("from", int),
			parameter("to", int),
		],
		returnType: string,
		statements: [
			when(binary(id("from"), ">=", id("to")), [returnValue(text(""))]),
			when(binary(call("len", [id("value")]), "==", id("length")), [
				returnValue(GoAST.createSliceExpression({
					target: id("value"),
					low: id("from"),
					high: id("to"),
				})),
			]),
			declare("start", integer(-1)),
			declare("end", call("len", [id("value")])),
			declare("split", GoAST.createBooleanLiteral({ value: false })),
			declare("units", integer(0)),
			forEachCharacter("index", [
				when(binary(units, ">=", id("to")), [
					assign("end", id("index")),
					GoAST.createBreakStatement({}),
				]),
				...declareSize,
				when(binary(binary(id("start"), "<", integer(0)), "&&", binary(unitsAfter, ">", id("from"))), [
					assign("start", id("index")),
					assign("split", binary(units, "<", id("from"))),
				]),
				when(binary(unitsAfter, ">", id("to")), [assign("split", GoAST.createBooleanLiteral({ value: true }))]),
				GoAST.createCompoundAssignmentStatement({
					operator: "+=",
					target: units,
					value: id("size"),
				}),
			]),
			when(
				GoAST.createUnaryExpression({
					operator: "!",
					operand: id("split"),
				}),
				[
					returnValue(GoAST.createSliceExpression({
						target: id("value"),
						low: id("start"),
						high: id("end"),
					})),
				],
			),
			returnValue(call("jsStringSplitUnits", [id("value"), id("from"), id("to")])),
		],
	});
}

/**
 * Cas rare : `from` ou `to` coupe une paire UTF-16. Copie, avec `U+FFFD` pour
 * chaque moitié de paire (ce qu'affiche Node).
 * ```go
 * func jsStringSplitUnits(value string, from int, to int) string {
 *     var builder strings.Builder
 *     units := 0
 *     for _, character := range value {
 *         size := 1
 *         if character >= 0x10000 { size = 2 }
 *         if units >= from && units+size <= to {
 *             builder.WriteRune(character)
 *         } else if units < to && units+size > from {
 *             builder.WriteRune(0xFFFD)
 *         }
 *         units += size
 *     }
 *     return builder.String()
 * }
 * ```
 */
function splitUnitsFunction() {
	const units = id("units");
	const size = binary(units, "+", id("size"));

	return goFunction({
		name: "jsStringSplitUnits",
		parameters: [
			parameter("value", string),
			parameter("from", int),
			parameter("to", int),
		],
		returnType: string,
		statements: [
			GoAST.createVariableDeclarationZeroValue({
				identifier: id("builder"),
				typeReference: GoAST.createPackageTypeReference({
					packageName: id("strings"),
					identifier: id("Builder"),
				}),
			}),
			declare("units", integer(0)),
			forEachCharacter("_", [
				...declareSize,
				GoAST.createIfStatement({
					condition: binary(binary(units, ">=", id("from")), "&&", binary(size, "<=", id("to"))),
					body: block([call("WriteRune", [id("character")], "builder")]),
					elseBranch: GoAST.createIfStatement({
						condition: binary(binary(units, "<", id("to")), "&&", binary(size, ">", id("from"))),
						body: block([call("WriteRune", [integer(0xFFFD)], "builder")]),
					}),
				}),
				GoAST.createCompoundAssignmentStatement({
					operator: "+=",
					target: units,
					value: id("size"),
				}),
			]),
			returnValue(call("String", [], "builder")),
		],
	});
}

/** `ToIntegerOrInfinity` d'ECMAScript : `NaN` -> 0, sinon troncature. */
function toIntegerFunction() {
	return goFunction({
		name: "jsToInteger",
		parameters: [parameter("position", float64)],
		returnType: float64,
		statements: [
			when(call("IsNaN", [id("position")], "math"), [returnValue(integer(0))]),
			returnValue(call("Trunc", [id("position")], "math")),
		],
	});
}

/** Position négative et `relative` : comptée depuis la fin (`position += float64(length)`). */
const countFromEnd = when(
	binary(id("relative"), "&&", binary(id("position"), "<", integer(0))),
	[assign("position", binary(id("position"), "+", convert(float64, id("length"))))],
);

/** Position bornée à `[0, length]` ; `relative` : négatif = depuis la fin (`slice`). */
function indexFunction() {
	return goFunction({
		name: "jsStringIndex",
		parameters: [
			parameter("position", float64),
			parameter("length", int),
			parameter("relative", bool),
		],
		returnType: int,
		statements: [
			assign("position", call("jsToInteger", [id("position")])),
			countFromEnd,
			when(binary(id("position"), "<", integer(0)), [returnValue(integer(0))]),
			when(binary(id("position"), ">", convert(float64, id("length"))), [returnValue(id("length"))]),
			returnValue(convert(int, id("position"))),
		],
	});
}

function sliceFunction() {
	return goFunction({
		name: "JSStringSlice",
		parameters: [
			parameter("value", string),
			parameter("start", float64),
			parameter("end", float64),
		],
		returnType: string,
		statements: [
			declareLength,
			declare("from", call("jsStringIndex", [id("start"), id("length"), GoAST.createBooleanLiteral({ value: true })])),
			declare("to", call("jsStringIndex", [id("end"), id("length"), GoAST.createBooleanLiteral({ value: true })])),
			when(binary(id("from"), ">=", id("to")), [returnValue(text(""))]),
			returnValue(unitSlice(id("from"), id("to"))),
		],
	});
}

function substringFunction() {
	const absolute = GoAST.createBooleanLiteral({ value: false });

	return goFunction({
		name: "JSStringSubstring",
		parameters: [parameter("value", string), parameter("start", float64)],
		variadic: parameter("end", float64),
		returnType: string,
		statements: [
			declareLength,
			declare("from", call("jsStringIndex", [id("start"), id("length"), absolute])),
			declare("to", id("length")),
			when(binary(call("len", [id("end")]), ">", integer(0)), [
				assign("to", call("jsStringIndex", [
					GoAST.createIndexExpression({
						target: id("end"),
						index: integer(0),
					}),
					id("length"),
					absolute,
				])),
			]),
			when(binary(id("from"), ">", id("to")), [
				GoAST.createAssignmentStatement({
					targets: DCommon.cast([id("from"), id("to")]),
					values: DCommon.cast([id("to"), id("from")]),
				}),
			]),
			returnValue(unitSlice(id("from"), id("to"))),
		],
	});
}

/** Unité UTF-16 à `index`, ou `""` hors de la chaîne (une unité n'est jamais vide). */
function unitAtFunction() {
	return goFunction({
		name: "jsStringUnitAt",
		parameters: [
			parameter("value", string),
			parameter("index", float64),
			parameter("relative", bool),
		],
		returnType: string,
		statements: [
			declareLength,
			declare("position", call("jsToInteger", [id("index")])),
			countFromEnd,
			when(
				binary(
					binary(id("position"), "<", integer(0)),
					"||",
					binary(id("position"), ">=", convert(float64, id("length"))),
				),
				[returnValue(text(""))],
			),
			declare("unit", convert(int, id("position"))),
			returnValue(unitSlice(id("unit"), binary(id("unit"), "+", integer(1)))),
		],
	});
}

function charAtFunction() {
	return goFunction({
		name: "JSStringCharAt",
		parameters: [parameter("value", string), parameter("index", float64)],
		returnType: string,
		statements: [returnValue(call("jsStringUnitAt", [id("value"), id("index"), GoAST.createBooleanLiteral({ value: false })]))],
	});
}

const undefinedValue = GoAST.createStructLiteral({
	typeReference: id("JSUndefined"),
	elements: [],
});

function atFunction() {
	return goFunction({
		name: "JSStringAt",
		parameters: [parameter("value", string), parameter("index", float64)],
		returnType: any,
		statements: [
			declare("unit", call("jsStringUnitAt", [id("value"), id("index"), GoAST.createBooleanLiteral({ value: true })])),
			when(binary(id("unit"), "==", text("")), [returnValue(undefinedValue)]),
			returnValue(id("unit")),
		],
	});
}

function indexOfFunction() {
	return goFunction({
		name: "JSStringIndexOf",
		parameters: [parameter("value", string), parameter("search", string)],
		variadic: parameter("position", float64),
		returnType: any,
		statements: [
			declareLength,
			declare("from", integer(0)),
			when(binary(call("len", [id("position")]), ">", integer(0)), [
				assign("from", call("jsStringIndex", [
					GoAST.createIndexExpression({
						target: id("position"),
						index: integer(0),
					}),
					id("length"),
					GoAST.createBooleanLiteral({ value: false }),
				])),
			]),
			// Une recherche vide est trouvée à la position demandée (même au milieu d'une paire).
			when(binary(id("search"), "==", text("")), [returnValue(convert(float64, id("from")))]),
			declare("start", call("jsStringOffset", [id("value"), id("from")])),
			declare("found", call("Index", [
				GoAST.createSliceExpression({
					target: id("value"),
					low: id("start"),
				}),
				id("search"),
			], "strings")),
			when(binary(id("found"), "<", integer(0)), [returnValue(undefinedValue)]),
			// Unités avant la correspondance, comptées depuis le début : `from` peut
			// tomber au milieu d'une paire, que `jsStringOffset` a sautée.
			returnValue(call("JSStringLength", [
				GoAST.createSliceExpression({
					target: id("value"),
					high: binary(id("start"), "+", id("found")),
				}),
			])),
		],
	});
}

function predicateFunction(name: string, goName: string) {
	return goFunction({
		name,
		parameters: [parameter("value", string), parameter("search", string)],
		returnType: bool,
		statements: [returnValue(call(goName, [id("value"), id("search")], "strings"))],
	});
}

/** `strings.NewReplacer(...)` des caractères dont la casse en donne plusieurs. */
function expansionReplacer(name: string, expansions: readonly (readonly [string, string])[]) {
	return GoAST.createVariableDeclarationInitialized({
		identifier: id(name),
		initializer: call("NewReplacer", expansions.flatMap(([from, to]) => [text(from), text(to)]), "strings"),
	});
}

function caseConversion(goName: string, replacer: string, value: GoAST.Expression) {
	return call(goName, [call("Replace", [value], replacer)], "strings");
}

function upperCaseFunction() {
	return goFunction({
		name: "JSStringToUpperCase",
		parameters: [parameter("value", string)],
		returnType: string,
		statements: [returnValue(caseConversion("ToUpper", "jsUpperCaseExpansions", id("value")))],
	});
}

const finalSigma = GoAST.createRuneLiteral({ value: "ς" });
const capitalSigma = GoAST.createRuneLiteral({ value: "Σ" });

/**
 * ```go
 * func JSStringToLowerCase(value string) string {
 *     lower := strings.ToLower(jsLowerCaseExpansions.Replace(value))
 *     if !strings.ContainsRune(value, 'Σ') { return lower }
 *     // Règle Final_Sigma : Σ en fin de mot devient ς (« ΟΔΟΣ » -> « οδος »).
 *     characters := []rune(value)
 *     var builder strings.Builder
 *     for index, character := range characters {
 *         final := jsHasCasedNeighbor(characters, index, -1) && !jsHasCasedNeighbor(characters, index, 1)
 *         if character == 'Σ' && final {
 *             builder.WriteRune('ς')
 *         } else {
 *             builder.WriteString(strings.ToLower(jsLowerCaseExpansions.Replace(string(character))))
 *         }
 *     }
 *     return builder.String()
 * }
 * ```
 */
function lowerCaseFunction() {
	const characters = id("characters");
	const lowerCharacter = caseConversion("ToLower", "jsLowerCaseExpansions", convert(string, id("character")));
	const neighbor = (step: number) => call("jsHasCasedNeighbor", [characters, id("index"), integer(step)]);

	return goFunction({
		name: "JSStringToLowerCase",
		parameters: [parameter("value", string)],
		returnType: string,
		statements: [
			declare("lower", caseConversion("ToLower", "jsLowerCaseExpansions", id("value"))),
			when(
				GoAST.createUnaryExpression({
					operator: "!",
					operand: call("ContainsRune", [id("value"), capitalSigma], "strings"),
				}),
				[returnValue(id("lower"))],
			),
			declare("characters", GoAST.createConversionExpression({
				typeReference: GoAST.createSliceType({ elementType: GoAST.builtinTypeReferences.rune }),
				operand: id("value"),
			})),
			GoAST.createVariableDeclarationZeroValue({
				identifier: id("builder"),
				typeReference: GoAST.createPackageTypeReference({
					packageName: id("strings"),
					identifier: id("Builder"),
				}),
			}),
			GoAST.createRangeStatement({
				binding: GoAST.createRangeDeclaration({
					key: id("index"),
					value: id("character"),
				}),
				expression: characters,
				body: block([
					GoAST.createIfStatement({
						condition: binary(
							binary(binary(id("character"), "==", capitalSigma), "&&", neighbor(-1)),
							"&&",
							GoAST.createUnaryExpression({
								operator: "!",
								operand: neighbor(1),
							}),
						),
						body: block([call("WriteRune", [finalSigma], "builder")]),
						elseBranch: block([call("WriteString", [lowerCharacter], "builder")]),
					}),
				]),
			}),
			returnValue(call("String", [], "builder")),
		],
	});
}

/**
 * Lettre « casée » avant (`step` = -1) ou après (`step` = 1) la position, en
 * sautant les caractères « ignorables » (accents combinants, apostrophes…).
 * ```go
 * func jsHasCasedNeighbor(characters []rune, index int, step int) bool {
 *     for position := index + step; position >= 0 && position < len(characters); position += step {
 *         if unicode.In(characters[position], unicode.Mn, unicode.Me, unicode.Cf, unicode.Lm, unicode.Sk) ||
 *             strings.ContainsRune(caseIgnorablePunctuation, characters[position]) { continue }
 *         return unicode.In(characters[position], unicode.Lu, unicode.Ll, unicode.Lt,
 *             unicode.Other_Lowercase, unicode.Other_Uppercase)
 *     }
 *     return false
 * }
 * ```
 */
function casedNeighborFunction() {
	const position = id("position");
	const character = GoAST.createIndexExpression({
		target: id("characters"),
		index: position,
	});
	const tables = (names: readonly string[]) => names.map((name) => GoAST.createSelectorExpression({
		target: id("unicode"),
		identifier: id(name),
	}));
	const cased = call("In", [character, ...tables(["Lu", "Ll", "Lt", "Other_Lowercase", "Other_Uppercase"])], "unicode");
	const ignorable = binary(
		call("In", [character, ...tables(["Mn", "Me", "Cf", "Lm", "Sk"])], "unicode"),
		"||",
		// Word_Break MidLetter, MidNumLet et Single_Quote : aussi « case-ignorable ».
		call("ContainsRune", [text("'.:··՟״‘’․‧︓﹒﹕＇．："), character], "strings"),
	);

	return goFunction({
		name: "jsHasCasedNeighbor",
		parameters: [
			parameter("characters", GoAST.createSliceType({ elementType: GoAST.builtinTypeReferences.rune })),
			parameter("index", int),
			parameter("step", int),
		],
		returnType: bool,
		statements: [
			GoAST.createForStatement({
				initializer: declare("position", binary(id("index"), "+", id("step"))),
				condition: binary(
					binary(position, ">=", integer(0)),
					"&&",
					binary(position, "<", call("len", [id("characters")])),
				),
				post: GoAST.createCompoundAssignmentStatement({
					operator: "+=",
					target: position,
					value: id("step"),
				}),
				body: block([
					// Un caractère à la fois casé et ignorable (`ʰ`) est d'abord ignorable (Unicode, Final_Sigma).
					when(ignorable, [GoAST.createContinueStatement({})]),
					returnValue(cased),
				]),
			}),
			returnValue(GoAST.createBooleanLiteral({ value: false })),
		],
	});
}

export const jsStringIdentifiers = {
	length: id("JSStringLength"),
	slice: id("JSStringSlice"),
	substring: id("JSStringSubstring"),
	charAt: id("JSStringCharAt"),
	at: id("JSStringAt"),
	indexOf: id("JSStringIndexOf"),
	includes: id("JSStringIncludes"),
	startsWith: id("JSStringStartsWith"),
	endsWith: id("JSStringEndsWith"),
	toUpperCase: id("JSStringToUpperCase"),
	toLowerCase: id("JSStringToLowerCase"),
} as const;

/**
 * Tous les helpers de chaînes dans une seule dépendance : ils s'appellent entre
 * eux et Go élimine ceux qui ne servent pas à l'édition des liens.
 * Dépend de `JSUndefined` : le handler enregistre aussi cette dépendance.
 */
export const jsStringDependency = DCommon.memo(() => createSharedDependency({
	imports: [
		GoAST.createImportDeclaration({ path: "math" }),
		GoAST.createImportDeclaration({ path: "strings" }),
		GoAST.createImportDeclaration({ path: "unicode" }),
	],
	init: [],
	declarations: [
		lengthFunction(),
		offsetFunction(),
		unitsFunction(),
		splitUnitsFunction(),
		toIntegerFunction(),
		indexFunction(),
		sliceFunction(),
		substringFunction(),
		unitAtFunction(),
		charAtFunction(),
		atFunction(),
		indexOfFunction(),
		predicateFunction("JSStringIncludes", "Contains"),
		predicateFunction("JSStringStartsWith", "HasPrefix"),
		predicateFunction("JSStringEndsWith", "HasSuffix"),
		expansionReplacer("jsUpperCaseExpansions", upperCaseExpansions),
		expansionReplacer("jsLowerCaseExpansions", lowerCaseExpansions),
		upperCaseFunction(),
		lowerCaseFunction(),
		casedNeighborFunction(),
	],
}));
