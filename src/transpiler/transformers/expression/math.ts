import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createSharedDependency, createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import type { BuildContext } from "../../context/build";
import { go } from "../shared/goBuilder";
import { mathImportDeclaration } from "./javascriptNumber";
import { expressionTransformers } from ".";

/**
 * L'objet global `Math` (D-19). Les fonctions IEEE 754 sont les mêmes en Go et
 * en JS : elles appellent directement le paquet `math`. Deux diffèrent et passent
 * par un helper :
 * - `Math.round` arrondit `x.5` **vers le haut** (`Math.round(-2.5) === -2`), alors
 *   que `math.Round` s'éloigne de zéro (`-3`) ;
 * - `Math.sign` n'existe pas en Go.
 * `Math.max()` / `Math.min()` acceptent n'importe quel nombre d'arguments :
 * l'appel est déplié (`math.Max(math.Max(a, b), c)`), et sans argument JS donne
 * `-Infinity` / `Infinity`.
 */

type Result = Awaited<ReturnType<Transformer<GoAST.Expression>["transformer"]>>;

/** Fonctions dont la sémantique est identique en Go : `Math.x` -> `math.X`. */
const directFunctions: Readonly<Record<string, string>> = {
	abs: "Abs",
	floor: "Floor",
	ceil: "Ceil",
	trunc: "Trunc",
	sqrt: "Sqrt",
	cbrt: "Cbrt",
	exp: "Exp",
	log: "Log",
	log2: "Log2",
	log10: "Log10",
	sin: "Sin",
	cos: "Cos",
	tan: "Tan",
	asin: "Asin",
	acos: "Acos",
	atan: "Atan",
	atan2: "Atan2",
	pow: "Pow",
};

const constants: Readonly<Record<string, string>> = {
	PI: "Pi",
	// `Math.E` : le nom vient de JavaScript.
	// eslint-disable-next-line id-length
	E: "E",
	LN2: "Ln2",
	LN10: "Ln10",
	LOG2E: "Log2E",
	LOG10E: "Log10E",
	SQRT2: "Sqrt2",
};

const { float64 } = go.types;

/**
 * ```go
 * func JSRound(value float64) float64 {
 *     if math.IsNaN(value) || math.IsInf(value, 0) { return value }
 *     if value < 0 && value >= -0.5 { return math.Copysign(0, -1) } // -0, comme JS
 *     return math.Floor(value + 0.5)
 * }
 * func JSSign(value float64) float64 {
 *     if value > 0 { return 1 }
 *     if value < 0 { return -1 }
 *     return value // 0, -0 et NaN restent tels quels
 * }
 * ```
 */
export const javascriptMathDependency = DCommon.memo(() => {
	const value = go.id("value");
	const mathCall = (name: string, callArguments: readonly GoAST.Expression[]) => go.call(go.select("math", name), callArguments);

	return createSharedDependency({
		imports: [mathImportDeclaration.value],
		init: [],
		declarations: [
			go.function({
				name: "JSRound",
				parameters: [go.parameter("value", float64)],
				returns: float64,
				body: [
					go.when(
						go.binary(mathCall("IsNaN", [value]), "||", mathCall("IsInf", [value, go.int(0)])),
						[go.return(value)],
					),
					go.when(
						go.binary(go.binary(value, "<", go.int(0)), "&&", go.binary(value, ">=", GoAST.createFloatLiteral({ value: "-0.5" }))),
						[
							go.return(mathCall("Copysign", [
								go.int(0),
								GoAST.createUnaryExpression({
									operator: "-",
									operand: go.int(1),
								}),
							])),
						],
					),
					go.return(mathCall("Floor", [go.binary(value, "+", GoAST.createFloatLiteral({ value: "0.5" }))])),
				],
			}),
			go.function({
				name: "JSSign",
				parameters: [go.parameter("value", float64)],
				returns: float64,
				body: [
					go.when(go.binary(value, ">", go.int(0)), [go.return(go.int(1))]),
					go.when(go.binary(value, "<", go.int(0)), [
						go.return(GoAST.createUnaryExpression({
							operator: "-",
							operand: go.int(1),
						})),
					]),
					go.return(value),
				],
			}),
		],
	});
});

/** `Math` est-il bien l'objet global de la bibliothèque standard ? */
async function isGlobalMath(node: TsAST.Expression, context: BuildContext) {
	if (!TsAST.isIdentifier(node) || node.text !== "Math") {
		return false;
	}

	const symbol = await context.transpilation.typeChecker.getSymbolAtLocation(node);
	const declaration = symbol?.declarations?.[0];

	// Déclaré dans un fichier de types (la bibliothèque standard), pas une variable du projet.
	return declaration !== undefined && String(declaration.path).endsWith(".d.ts");
}

function mathSelector(context: BuildContext, name: string) {
	context.file.imports.add(mathImportDeclaration.value);

	return go.select("math", name);
}

function shardHelper(context: BuildContext, name: string) {
	return GoAST.createSelectorExpression({
		target: context.registerSharedDependency(javascriptMathDependency.value),
		identifier: GoAST.createIdentifier(name),
	});
}

export const mathTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context): Promise<Result> => {
		// Constante : `Math.PI`.
		if (TsAST.isPropertyAccessExpression(node) && await isGlobalMath(node.expression, context)) {
			const constant = constants[node.name.text];

			return constant
				? context.success({ result: mathSelector(context, constant) })
				: context.error(node, "math-member-not-supported-yet");
		}

		if (
			!TsAST.isCallExpression(node)
			|| !TsAST.isPropertyAccessExpression(node.expression)
			|| !await isGlobalMath(node.expression.expression, context)
		) {
			return context.notSupport();
		}

		const name = node.expression.name.text;
		const before: GoAST.Statement[] = [];
		const values: GoAST.Expression[] = [];

		for (const argument of node.arguments) {
			const value = await DCommon.asyncPipe(
				context.transform(argument, expressionTransformers.value),
				DEither.unwrapRight,
			);

			if (DEither.isLeft(value)) {
				return value;
			}

			before.push(...value.before);
			values.push(value.result);
		}

		const success = (result: GoAST.Expression) => context.success({
			before,
			result,
		});

		if (name === "max" || name === "min") {
			const [first, ...rest] = values;
			const empty = mathSelector(context, "Inf");

			return success(first
				? rest.reduce<GoAST.Expression>(
					(left, right) => go.call(mathSelector(context, name === "max" ? "Max" : "Min"), [left, right]),
					first,
				)
				: go.call(empty, [go.int(name === "max" ? -1 : 1)]));
		}

		if (name === "round" || name === "sign") {
			return success(go.call(shardHelper(context, name === "round" ? "JSRound" : "JSSign"), values));
		}

		if (name === "random") {
			context.file.imports.add(randImportDeclaration.value);

			return success(go.call(go.select("rand", "Float64")));
		}

		const direct = directFunctions[name];

		return direct
			? success(go.call(mathSelector(context, direct), values))
			: context.error(node, "math-function-not-supported-yet");
	},
);

const randImportDeclaration = DCommon.memo(() => GoAST.createImportDeclaration({ path: "math/rand/v2" }));
