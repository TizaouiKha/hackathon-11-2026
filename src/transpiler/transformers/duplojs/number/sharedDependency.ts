import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { go } from "../../shared/goBuilder";

/**
 * Helpers Go des fonctions `DNumber` (D-25). Un helper par fonction : une fonction
 * passée en valeur (`DArray.filter(list, DNumber.isEven)`) devient simplement
 * `shard_dependencies.NumberIsEven`, de type `func(float64) bool`.
 *
 * Tous suivent JavaScript, y compris pour `NaN`, `±Infinity` et `-0` :
 * - `isEven` / `isOdd` / `isMultipleOf` : `%` de JS = `math.Mod` (même signe) ;
 * - `isInteger` : fini et sans partie décimale (`Number.isInteger`) ;
 * - `isSafe` : strictement entre `MIN_SAFE_INTEGER` et `MAX_SAFE_INTEGER` ;
 * - `max` / `min` : `Math.max(...values)` (`NaN` contagieux, `-Infinity` si vide,
 *   `+0` plus grand que `-0`) ; `maxOf` / `minOf` : la boucle de DuploJS ;
 * - `sort` : copie triée, stable, `"DSC"` décroissant.
 */

const value = go.id("value");
const values = go.id("values");
const number = go.types.float64;
const numbers = GoAST.createSliceType({ elementType: number });
const math = (name: string, callArguments: readonly GoAST.Expression[]) => go.call(go.select("math", name), callArguments);
const and = (left: GoAST.Expression, right: GoAST.Expression) => go.binary(left, "&&", right);
const or = (left: GoAST.Expression, right: GoAST.Expression) => go.binary(left, "||", right);
const mod = (divisor: GoAST.Expression) => math("Mod", [value, divisor]);
const maxSafeInteger = GoAST.createFloatLiteral({ value: "9007199254740991" });

export const numberHelperNames = {
	greaterThan: "NumberGreaterThan",
	greaterThanOrEqual: "NumberGreaterThanOrEqual",
	lessThan: "NumberLessThan",
	lessThanOrEqual: "NumberLessThanOrEqual",
	betweenThan: "NumberBetweenThan",
	betweenThanOrEqual: "NumberBetweenThanOrEqual",
	isMultipleOf: "NumberIsMultipleOf",
	isEven: "NumberIsEven",
	isOdd: "NumberIsOdd",
	isInteger: "NumberIsInteger",
	isNegative: "NumberIsNegative",
	isPositive: "NumberIsPositive",
	isStrictNegative: "NumberIsStrictNegative",
	isStrictPositive: "NumberIsStrictPositive",
	isNotZero: "NumberIsNotZero",
	isSafe: "NumberIsSafe",
	sum: "NumberSum",
	max: "NumberMax",
	min: "NumberMin",
	maxOf: "NumberMaxOf",
	minOf: "NumberMinOf",
	sort: "NumberSort",
} as const;

export type NumberFunctionName = keyof typeof numberHelperNames;

/** `func NumberX(value float64, <autres>) bool { return <expression> }` */
function predicate(name: NumberFunctionName, others: readonly string[], body: GoAST.Expression) {
	return go.function({
		name: numberHelperNames[name],
		parameters: [go.parameter("value", number), ...others.map((other) => go.parameter(other, number))],
		returns: go.types.bool,
		body: [go.return(body)],
	});
}

function compare(name: NumberFunctionName, operator: GoAST.BinaryOperator) {
	return predicate(name, ["threshold"], go.binary(value, operator, go.id("threshold")));
}

function between(name: NumberFunctionName, lower: GoAST.BinaryOperator, upper: GoAST.BinaryOperator) {
	return predicate(
		name,
		["greater", "less"],
		and(go.binary(value, lower, go.id("greater")), go.binary(value, upper, go.id("less"))),
	);
}

function sign(name: NumberFunctionName, operator: GoAST.BinaryOperator) {
	return predicate(name, [], go.binary(value, operator, go.int(0)));
}

/** `for _, value := range values { <body> }` */
function forEachValue(body: readonly GoAST.Statement[]) {
	return GoAST.createRangeStatement({
		binding: GoAST.createRangeDeclaration({
			key: go.id("_"),
			value,
		}),
		expression: values,
		body: go.block(body),
	});
}

function listFunction(name: NumberFunctionName, body: readonly GoAST.Statement[]) {
	return go.function({
		name: numberHelperNames[name],
		parameters: [go.parameter("values", numbers)],
		returns: number,
		body,
	});
}

/** `Math.max` / `Math.min` : `NaN` contagieux, et `+0 > -0`. */
function extreme(name: "max" | "min") {
	const operator = name === "max" ? ">" : "<";
	const zeroWins = name === "max" ? go.not(math("Signbit", [value])) : math("Signbit", [value]);

	return listFunction(name, [
		go.declare("result", math("Inf", [go.int(name === "max" ? -1 : 1)])),
		forEachValue([
			go.when(math("IsNaN", [value]), [go.return(math("NaN", []))]),
			go.when(
				or(
					go.binary(value, operator, go.id("result")),
					and(and(go.binary(value, "==", go.int(0)), go.binary(go.id("result"), "==", go.int(0))), zeroWins),
				),
				[go.assign([go.id("result")], [value])],
			),
		]),
		go.return(go.id("result")),
	]);
}

/** La boucle de DuploJS : on part du premier élément. */
function extremeOf(name: "maxOf" | "minOf") {
	return listFunction(name, [
		go.declare("result", go.index(values, go.int(0))),
		forEachValue([go.when(go.binary(value, name === "maxOf" ? ">" : "<", go.id("result")), [go.assign([go.id("result")], [value])])]),
		go.return(go.id("result")),
	]);
}

function difference(first: string, second: string) {
	return go.binary(go.index(go.id("output"), go.id(first)), "-", go.index(go.id("output"), go.id(second)));
}

export const numberDependency = DCommon.memo(() => createSharedDependency({
	imports: [GoAST.createImportDeclaration({ path: "math" }), GoAST.createImportDeclaration({ path: "sort" })],
	init: [],
	declarations: [
		compare("greaterThan", ">"),
		compare("greaterThanOrEqual", ">="),
		compare("lessThan", "<"),
		compare("lessThanOrEqual", "<="),
		between("betweenThan", ">", "<"),
		between("betweenThanOrEqual", ">=", "<="),
		predicate("isMultipleOf", ["multiple"], go.binary(mod(go.id("multiple")), "==", go.int(0))),
		predicate("isEven", [], go.binary(mod(go.int(2)), "==", go.int(0))),
		predicate("isOdd", [], go.binary(mod(go.int(2)), "!=", go.int(0))),
		predicate("isInteger", [], and(
			go.not(math("IsInf", [value, go.int(0)])),
			go.binary(math("Trunc", [value]), "==", value),
		)),
		sign("isNegative", "<="),
		sign("isPositive", ">="),
		sign("isStrictNegative", "<"),
		sign("isStrictPositive", ">"),
		sign("isNotZero", "!="),
		predicate("isSafe", [], and(
			go.binary(value, ">", GoAST.createUnaryExpression({
				operator: "-",
				operand: maxSafeInteger,
			})),
			go.binary(value, "<", maxSafeInteger),
		)),
		listFunction("sum", [
			go.declare("result", go.convert(number, go.int(0))),
			forEachValue([go.assign([go.id("result")], [go.binary(go.id("result"), "+", value)])]),
			go.return(go.id("result")),
		]),
		extreme("max"),
		extreme("min"),
		extremeOf("maxOf"),
		extremeOf("minOf"),
		// sort : DuploJS trie une copie (`array.slice().sort(...)`), tri stable comme JS.
		go.function({
			name: numberHelperNames.sort,
			parameters: [go.parameter("values", numbers), go.parameter("order", go.types.string)],
			returns: numbers,
			body: [
				go.declare("output", GoAST.createCallExpression({
					callee: go.id("make"),
					typeArgument: numbers,
					arguments: [go.call("len", [values])],
				})),
				go.call("copy", [go.id("output"), values]) as unknown as GoAST.Statement,
				go.declare("descending", go.binary(go.id("order"), "==", go.string("DSC"))),
				go.call(go.select("sort", "SliceStable"), [
					go.id("output"),
					GoAST.createFunctionLiteral({
						arguments: [go.parameter("first", go.types.int), go.parameter("second", go.types.int)],
						returnTypes: [go.types.bool],
						body: go.block([
							go.when(go.id("descending"), [go.return(go.binary(difference("second", "first"), "<", go.int(0)))]),
							go.return(go.binary(difference("first", "second"), "<", go.int(0))),
						]),
					}),
				]) as unknown as GoAST.Statement,
				go.return(go.id("output")),
			],
		}),
	],
}));
