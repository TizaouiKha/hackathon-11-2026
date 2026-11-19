import { type Transformer } from "@transformer";
import { GoAST, GoPrinter } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { SignatureKind, TypeFlags, type Type } from "typescript/async";
import { type BuildContext } from "../../../../context/build";
import { undefinedShardDependency } from "../../../../sharedDependency/defaults";
import { expressionTransformers } from "../../../expression";
import { tsTypeToGo, type GoType } from "../../../type/tsTypeToGo";
import { jsStringDependency } from "./sharedDependency";

type TransformerResult = Awaited<ReturnType<Transformer<GoAST.Expression>["transformer"]>>;

/**
 * Une fonction `DString.*` traduite par un helper Go (D-18.4).
 * Forme avec données : `DString.slice(text, 0, 2)` ; forme curryfiée :
 * `DString.slice(0, 2)` (une fonction qui attend la chaîne).
 */
export interface StringFunction {
	readonly helper: GoAST.Identifier;

	/** Arguments après la chaîne, obligatoires puis facultatifs. */
	readonly required: number;
	readonly optional: number;

	/**
	 * Le helper renvoie `any` (`string` ou `JSUndefined`, `float64` ou `JSUndefined`).
	 * Le type TS du résultat peut être plus précis (`DString.at` sur une chaîne
	 * `MinCharacters<1>` donne `string`) : le résultat est alors ouvert par assertion.
	 */
	readonly returnsAny?: boolean;
}

const renderedAny = GoPrinter.renderNode(GoAST.builtinTypeReferences.any);

/**
 * Contrat des transformeurs (D-18.2) : le Go produit a le type Go du type TS de
 * l'appel. Un helper qui renvoie `any` est ouvert quand ce type est plus précis.
 */
function fitResult(spec: StringFunction, result: GoAST.Expression, expected: GoType) {
	return spec.returnsAny && GoPrinter.renderNode(expected) !== renderedAny
		? GoAST.createTypeAssertionExpression({
			target: result,
			typeReference: expected,
		})
		: result;
}

function goTypeOf(type: Type, node: TsAST.Node, context: BuildContext) {
	return DCommon.asyncPipe(tsTypeToGo(type, node, context), DEither.unwrapRight);
}

function helperReference(spec: StringFunction, context: BuildContext) {
	// Les helpers renvoient `JSUndefined` pour les résultats `undefined`.
	context.registerSharedDependency(undefinedShardDependency.value);

	return GoAST.createSelectorExpression({
		target: context.registerSharedDependency(jsStringDependency.value),
		identifier: spec.helper,
	});
}

async function transformArguments(callArguments: readonly TsAST.Expression[], context: BuildContext) {
	const before: GoAST.Statement[] = [];
	const values: GoAST.Expression[] = [];

	for (const argument of callArguments) {
		const transformed = await DCommon.asyncPipe(
			context.transform(argument, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(transformed)) {
			return transformed;
		}

		before.push(...transformed.before);
		values.push(transformed.result);
	}

	return DEither.success({
		before,
		values,
	});
}

function inRange(count: number, minimum: number, extra: number) {
	return count >= minimum && count <= minimum + extra;
}

async function isDataForm(call: TsAST.CallExpression, spec: StringFunction, context: BuildContext) {
	const count = call.arguments.length;
	const dataForm = inRange(count, spec.required + 1, spec.optional);
	const curriedForm = inRange(count, spec.required, spec.optional);
	const first = DArray.first(call.arguments);

	// `substring(text, 1)` et `substring(1, 2)` ont le même nombre d'arguments :
	// la forme avec données commence par la chaîne.
	if (dataForm && curriedForm && first) {
		const firstType = await context.transpilation.typeChecker.getTypeAtLocation(first);

		return (firstType.flags & TypeFlags.StringLike) !== 0;
	}

	return dataForm;
}

/**
 * Forme curryfiée : les arguments sont évalués **une fois**, à la création de
 * la fonction (comme en TS), puis capturés par une fonction Go littérale.
 */
async function translateCurried(
	call: TsAST.CallExpression,
	spec: StringFunction,
	context: BuildContext,
): Promise<TransformerResult> {
	const { typeChecker } = context.transpilation;
	const signature = DArray.first(
		await typeChecker.getSignaturesOfType(await typeChecker.getTypeAtLocation(call), SignatureKind.Call),
	);

	if (!signature) {
		return context.error(call, "curried-string-function-without-signature");
	}

	const returnType = await goTypeOf(await signature.getReturnType(), call, context);

	if (DEither.isLeft(returnType)) {
		return returnType;
	}

	const transformed = await DCommon.asyncPipe(transformArguments(call.arguments, context), DEither.unwrapRight);

	if (DEither.isLeft(transformed)) {
		return transformed;
	}

	const captured = transformed.values.map((value) => GoAST.createShortVariableDeclarationStatement({
		identifier: context.generateIdentifier(),
		initializer: value,
	}));
	const input = context.generateIdentifier();

	return context.success({
		before: DArray.concat(transformed.before, captured),
		result: GoAST.createFunctionLiteral({
			arguments: [
				GoAST.createFunctionArgument({
					identifier: input,
					type: GoAST.builtinTypeReferences.string,
				}),
			],
			returnTypes: [returnType],
			body: GoAST.createBlockStatement({
				statements: [
					GoAST.createReturnStatement({
						values: DCommon.cast([
							fitResult(
								spec,
								GoAST.createCallExpression({
									callee: helperReference(spec, context),
									arguments: [input, ...captured.map((variable) => variable.identifier)],
								}),
								returnType,
							),
						]),
					}),
				],
			}),
		}),
	});
}

export async function stringFunctionHandler(
	node: TsAST.Node,
	spec: StringFunction,
	context: BuildContext,
): Promise<TransformerResult> {
	if (!TsAST.isCallExpression(node)) {
		// Passée comme fonction (`DArray.map(texts, DString.length)`) : seulement
		// pour une fonction à un argument, dont le helper a déjà la bonne signature.
		return spec.required === 0 && spec.optional === 0
			? context.success({ result: helperReference(spec, context) })
			: context.error(node, "string-function-as-value-must-be-called");
	}

	if (!await isDataForm(node, spec, context)) {
		return inRange(node.arguments.length, spec.required, spec.optional) && spec.required > 0
			? translateCurried(node, spec, context)
			: context.error(node, "string-function-wrong-argument-count");
	}

	const expected = await goTypeOf(await context.transpilation.typeChecker.getTypeAtLocation(node), node, context);

	if (DEither.isLeft(expected)) {
		return expected;
	}

	const transformed = await DCommon.asyncPipe(transformArguments(node.arguments, context), DEither.unwrapRight);

	if (DEither.isLeft(transformed)) {
		return transformed;
	}

	return context.success({
		before: transformed.before,
		result: fitResult(
			spec,
			GoAST.createCallExpression({
				callee: helperReference(spec, context),
				arguments: transformed.values,
			}),
			expected,
		),
	});
}
