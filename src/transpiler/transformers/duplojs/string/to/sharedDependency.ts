import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

export const jsNumberToStringIdentifier = GoAST.createIdentifier("JSNumberToString");

/*
 * Petits constructeurs locaux, pour garder lisible l'écriture du helper Go.
 */
const id = GoAST.createIdentifier;

function text(value: string) {
	return GoAST.createStringLiteral({ value });
}

function int(value: number) {
	return GoAST.createIntegerLiteral({ value: BigInt(value) });
}

function binary(left: GoAST.Expression, operator: GoAST.BinaryOperator, right: GoAST.Expression) {
	return GoAST.createBinaryExpression({
		left,
		operator,
		right,
	});
}

function negate(operand: GoAST.Expression) {
	return GoAST.createUnaryExpression({
		operator: "-",
		operand,
	});
}

function call(packageName: string | undefined, name: string, callArguments: readonly GoAST.Expression[]) {
	return GoAST.createCallExpression({
		callee: packageName === undefined
			? id(name)
			: GoAST.createSelectorExpression({
				target: id(packageName),
				identifier: id(name),
			}),
		arguments: callArguments,
	});
}

function slice(target: GoAST.Expression, low?: GoAST.Expression, high?: GoAST.Expression) {
	return GoAST.createSliceExpression({
		target,
		low,
		high,
	});
}

function declare(name: string, initializer: GoAST.Expression) {
	return GoAST.createShortVariableDeclarationStatement({
		identifier: id(name),
		initializer,
	});
}

function returnValue(value: GoAST.Expression) {
	return GoAST.createReturnStatement({ values: DCommon.cast([value]) });
}

function returnWhen(condition: GoAST.Expression, value: GoAST.Expression) {
	return GoAST.createIfStatement({
		condition,
		body: GoAST.createBlockStatement({ statements: [returnValue(value)] }),
	});
}

function concat(...parts: readonly GoAST.Expression[]): GoAST.Expression {
	const [first, ...rest] = parts;

	return rest.reduce<GoAST.Expression>(
		(left, right) => binary(left, "+", right),
		first ?? text(""),
	);
}

/**
 * Conversion d'un nombre en texte **exactement comme JavaScript**
 * (`Number.prototype.toString`, ECMAScript « Number::toString ») :
 * `3`, `-12`, `2.5`, `0.000001`, `1e-7`, `1e+21`, `NaN`, `Infinity`…
 *
 * ```go
 * func JSNumberToString(value float64) string {
 *     if math.IsNaN(value) { return "NaN" }
 *     if value == 0 { return "0" }                      // 0 et -0
 *     if math.IsInf(value, 1) { return "Infinity" }
 *     if math.IsInf(value, -1) { return "-Infinity" }
 *     if value < 0 { return "-" + JSNumberToString(-value) }
 *     text := strconv.FormatFloat(value, 'e', -1, 64)   // chiffres les plus courts : "1.5e+00"
 *     separator := strings.IndexByte(text, 'e')
 *     digits := strings.Replace(text[:separator], ".", "", 1)
 *     var exponent int
 *     exponent, _ = strconv.Atoi(text[separator+1:])
 *     length := len(digits)
 *     point := exponent + 1                             // position de la virgule
 *     if length <= point && point <= 21 { return digits + strings.Repeat("0", point-length) }
 *     if 0 < point && point <= 21 { return digits[:point] + "." + digits[point:] }
 *     if -6 < point && point <= 0 { return "0." + strings.Repeat("0", -point) + digits }
 *     mantissa := digits
 *     if length > 1 { mantissa = digits[:1] + "." + digits[1:] }
 *     if exponent < 0 { return mantissa + "e-" + strconv.Itoa(-exponent) }
 *     return mantissa + "e+" + strconv.Itoa(exponent)
 * }
 * ```
 * `strconv.FormatFloat(…, -1, …)` donne, comme JavaScript, le plus petit nombre
 * de chiffres qui redonne exactement le même `float64`.
 */
export const jsNumberToStringDependency = DCommon.memo(() => {
	const value = id("value");
	const digits = id("digits");
	const exponent = id("exponent");
	const length = id("length");
	const point = id("point");
	const mantissa = id("mantissa");
	const separator = id("separator");
	const textVariable = id("text");

	const statements: readonly GoAST.Statement[] = [
		returnWhen(call("math", "IsNaN", [value]), text("NaN")),
		returnWhen(binary(value, "==", int(0)), text("0")),
		returnWhen(call("math", "IsInf", [value, int(1)]), text("Infinity")),
		returnWhen(call("math", "IsInf", [value, negate(int(1))]), text("-Infinity")),
		returnWhen(
			binary(value, "<", int(0)),
			concat(text("-"), call(undefined, jsNumberToStringIdentifier.value, [negate(value)])),
		),
		declare("text", call("strconv", "FormatFloat", [
			value,
			GoAST.createRuneLiteral({ value: "e" }),
			negate(int(1)),
			int(64),
		])),
		declare("separator", call("strings", "IndexByte", [
			textVariable,
			GoAST.createRuneLiteral({ value: "e" }),
		])),
		declare("digits", call("strings", "Replace", [
			slice(textVariable, undefined, separator),
			text("."),
			text(""),
			int(1),
		])),
		GoAST.createVariableDeclarationZeroValue({
			identifier: exponent,
			typeReference: GoAST.builtinTypeReferences.int,
		}),
		GoAST.createAssignmentStatement({
			targets: DCommon.cast([exponent, id("_")]),
			values: DCommon.cast([call("strconv", "Atoi", [slice(textVariable, binary(separator, "+", int(1)))])]),
		}),
		declare("length", call(undefined, "len", [digits])),
		declare("point", binary(exponent, "+", int(1))),
		returnWhen(
			binary(binary(length, "<=", point), "&&", binary(point, "<=", int(21))),
			concat(digits, call("strings", "Repeat", [text("0"), binary(point, "-", length)])),
		),
		returnWhen(
			binary(binary(int(0), "<", point), "&&", binary(point, "<=", int(21))),
			concat(slice(digits, undefined, point), text("."), slice(digits, point)),
		),
		returnWhen(
			binary(binary(negate(int(6)), "<", point), "&&", binary(point, "<=", int(0))),
			concat(text("0."), call("strings", "Repeat", [text("0"), negate(point)]), digits),
		),
		declare("mantissa", digits),
		GoAST.createIfStatement({
			condition: binary(length, ">", int(1)),
			body: GoAST.createBlockStatement({
				statements: [
					GoAST.createAssignmentStatement({
						targets: DCommon.cast([mantissa]),
						values: DCommon.cast([concat(slice(digits, undefined, int(1)), text("."), slice(digits, int(1)))]),
					}),
				],
			}),
		}),
		returnWhen(
			binary(exponent, "<", int(0)),
			concat(mantissa, text("e-"), call("strconv", "Itoa", [negate(exponent)])),
		),
		returnValue(concat(mantissa, text("e+"), call("strconv", "Itoa", [exponent]))),
	];

	return createSharedDependency({
		imports: [
			GoAST.createImportDeclaration({ path: "math" }),
			GoAST.createImportDeclaration({ path: "strconv" }),
			GoAST.createImportDeclaration({ path: "strings" }),
		],
		init: [],
		declarations: [
			GoAST.createFunctionDeclaration({
				identifier: jsNumberToStringIdentifier,
				generic: [],
				arguments: [
					GoAST.createFunctionArgument({
						identifier: value,
						type: GoAST.builtinTypeReferences.float64,
					}),
				],
				returnTypes: [GoAST.builtinTypeReferences.string],
				body: GoAST.createBlockStatement({ statements }),
			}),
		],
	});
});
