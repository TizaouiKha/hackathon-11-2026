import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST, GoPrinter } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { TypeFlags, type Type } from "typescript/async";
import type { BuildContext } from "../../context/build";
import { tsTypeToGo, type GoType } from "../type/tsTypeToGo";
import { go } from "../shared/goBuilder";
import { jsStringDependency, jsStringIdentifiers } from "../duplojs/string/core/sharedDependency";
import { undefinedShardDependency } from "../../sharedDependency/defaults";
import { javascriptValue } from "./javascriptValues";
import { expressionTransformers } from ".";

/**
 * Accès aux propriétés et aux éléments (D-19).
 * | TypeScript | Go |
 * |---|---|
 * | `user.name` (objet) | `user.Sourced_name` |
 * | `values.length` (tableau, tuple) | `float64(len(values))` |
 * | `text.length` (chaîne) | `JSStringLength(text)` (unités UTF-16, D-18.4) |
 * | `record.key`, `record[key]` | `JSMapGet(record, key)` (`undefined` si absente) |
 * | `tuple[1]` (type exact) | `tuple[1]`, ou `tuple[1].(T)` si la slice est un `[]any` |
 * | `values[i]` (`T \| undefined`) | `JSElementAt(values, i)` (`undefined` hors du tableau) |
 */

type Result = Awaited<ReturnType<Transformer<GoAST.Expression>["transformer"]>>;

function render(type: GoType) {
	return GoPrinter.renderNode(type);
}

async function goTypeOf(type: Type, node: TsAST.Node, context: BuildContext) {
	return DCommon.asyncPipe(tsTypeToGo(type, node, context), DEither.unwrapRight);
}

async function isArrayLike(type: Type, context: BuildContext) {
	const { typeChecker } = context.transpilation;

	return await typeChecker.isArrayType(type) || await typeChecker.isTupleType(type);
}

/**
 * Contrat des transformers (D-18.2) : le Go produit a le type Go du type TS de
 * l'expression. Un helper qui renvoie `any` est ouvert quand TS connaît mieux.
 */
async function fitAny(expression: GoAST.Expression, node: TsAST.Expression, context: BuildContext) {
	const expected = await goTypeOf(await context.transpilation.typeChecker.getTypeAtLocation(node), node, context);

	if (DEither.isLeft(expected)) {
		return expected;
	}

	return DEither.success(
		render(expected) === "any" ? expression : go.assert(expression, expected),
	);
}

async function transformTarget(node: TsAST.Expression, context: BuildContext) {
	return DCommon.asyncPipe(
		context.transform(node, expressionTransformers.value),
		DEither.unwrapRight,
	);
}

function stringLength(target: GoAST.Expression, context: BuildContext) {
	context.registerSharedDependency(undefinedShardDependency.value);

	return go.call(
		GoAST.createSelectorExpression({
			target: context.registerSharedDependency(jsStringDependency.value),
			identifier: jsStringIdentifiers.length,
		}),
		[target],
	);
}

export const propertyAccessTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context): Promise<Result> => {
		if (!TsAST.isPropertyAccessExpression(node) || !TsAST.isIdentifier(node.name)) {
			return context.notSupport();
		}

		if (node.questionDotToken) {
			return context.error(node, "optional-chaining-not-supported-yet");
		}

		const { typeChecker } = context.transpilation;
		const targetType = await typeChecker.getTypeAtLocation(node.expression);
		const name = node.name.text;
		const target = await transformTarget(node.expression, context);

		if (DEither.isLeft(target)) {
			return target;
		}

		const success = (result: GoAST.Expression) => context.success({
			before: target.before,
			result,
		});

		if (name === "length" && await isArrayLike(targetType, context)) {
			return success(go.convert(go.types.float64, go.call("len", [target.result])));
		}

		if (name === "length" && (targetType.flags & TypeFlags.StringLike) !== 0) {
			return success(stringLength(target.result, context));
		}

		const targetGoType = await goTypeOf(targetType, node.expression, context);

		if (DEither.isLeft(targetGoType)) {
			return targetGoType;
		}

		const rendered = render(DEither.unwrapRight(targetGoType));

		if (rendered.startsWith("struct")) {
			return success(GoAST.createSelectorExpression({
				target: target.result,
				identifier: context.createSourceIdentifier(name),
			}));
		}

		if (rendered.startsWith("map[")) {
			const read = await fitAny(
				go.call(javascriptValue(context, "mapGet"), [target.result, go.string(name)]),
				node,
				context,
			);

			return DEither.isLeft(read) ? read : success(DEither.unwrapRight(read));
		}

		// Méthode d'un tableau ou d'une chaîne (`values.map`, `text.trim`) : utiliser DArray / DString.
		return context.error(node, "property-access-not-supported-yet");
	},
);

export const elementAccessTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context): Promise<Result> => {
		if (!TsAST.isElementAccessExpression(node)) {
			return context.notSupport();
		}

		if (node.questionDotToken) {
			return context.error(node, "optional-chaining-not-supported-yet");
		}

		const { typeChecker } = context.transpilation;
		const targetType = await typeChecker.getTypeAtLocation(node.expression);
		const target = await transformTarget(node.expression, context);

		if (DEither.isLeft(target)) {
			return target;
		}

		const key = await transformTarget(node.argumentExpression, context);

		if (DEither.isLeft(key)) {
			return key;
		}

		const before = [...target.before, ...key.before];
		const targetGoType = await goTypeOf(targetType, node.expression, context);

		if (DEither.isLeft(targetGoType)) {
			return targetGoType;
		}

		const rendered = render(DEither.unwrapRight(targetGoType));

		if (rendered.startsWith("map[")) {
			const read = await fitAny(go.call(javascriptValue(context, "mapGet"), [target.result, key.result]), node, context);

			return DEither.isLeft(read)
				? read
				: context.success({
					before,
					result: DEither.unwrapRight(read),
				});
		}

		if (!await isArrayLike(targetType, context) || !rendered.startsWith("[]")) {
			// `text[0]` : utiliser `DString.at` / `DString.charAt` (sémantique UTF-16).
			return context.error(node, "element-access-not-supported-yet");
		}

		const resultGoType = await goTypeOf(await typeChecker.getTypeAtLocation(node), node, context);

		if (DEither.isLeft(resultGoType)) {
			return resultGoType;
		}

		// `T | undefined` (`noUncheckedIndexedAccess`) : JS renvoie `undefined` hors du tableau.
		if (render(DEither.unwrapRight(resultGoType)) === "any") {
			return context.success({
				before,
				result: go.call(javascriptValue(context, "elementAt"), [target.result, key.result]),
			});
		}

		// Position connue de TS (tuple) : lecture directe, ouverte si la slice est un `[]any`.
		const read = go.index(target.result, go.convert(go.types.int, key.result));

		return context.success({
			before,
			result: rendered === "[]any" ? go.assert(read, DEither.unwrapRight(resultGoType)) : read,
		});
	},
);
