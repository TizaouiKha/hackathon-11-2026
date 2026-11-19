import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DPattern from "@duplojs/lang/pattern";
import { createTransformer, type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { TsAST } from "@typescript";
import { toExpressionHandler } from "./to";
import { stringFunctionHandler, type StringFunction } from "./core/stringFunction";
import { jsStringIdentifiers } from "./core/sharedDependency";

/** Fonctions `DString.*` traduites par un helper à sémantique UTF-16 (D-18.4). */
const stringFunctions: Readonly<Record<string, StringFunction>> = {
	length: {
		helper: jsStringIdentifiers.length,
		required: 0,
		optional: 0,
	},
	toUpperCase: {
		helper: jsStringIdentifiers.toUpperCase,
		required: 0,
		optional: 0,
	},
	toLowerCase: {
		helper: jsStringIdentifiers.toLowerCase,
		required: 0,
		optional: 0,
	},
	includes: {
		helper: jsStringIdentifiers.includes,
		required: 1,
		optional: 0,
	},
	startsWith: {
		helper: jsStringIdentifiers.startsWith,
		required: 1,
		optional: 0,
	},
	endsWith: {
		helper: jsStringIdentifiers.endsWith,
		required: 1,
		optional: 0,
	},
	charAt: {
		helper: jsStringIdentifiers.charAt,
		required: 1,
		optional: 0,
	},
	at: {
		helper: jsStringIdentifiers.at,
		required: 1,
		optional: 0,
		returnsAny: true,
	},
	indexOf: {
		helper: jsStringIdentifiers.indexOf,
		required: 1,
		optional: 1,
		returnsAny: true,
	},
	slice: {
		helper: jsStringIdentifiers.slice,
		required: 2,
		optional: 0,
	},
	substring: {
		helper: jsStringIdentifiers.substring,
		required: 1,
		optional: 1,
	},
};

/**
 * Routeur du domaine `@duplojs/lang/string` (fonctions `DString.*`).
 * Ajouter ici un `DPattern.match` par fonction prise en charge.
 */
export const duploJSStringExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		const reference = TsAST.isCallExpression(node)
			? node.expression
			: node;

		if (
			!TsAST.isIdentifier(reference)
			&& !TsAST.isPropertyAccessExpression(reference)
		) {
			return context.notSupport();
		}

		const moduleReference = await DCommon.asyncPipe(
			context.resolveReferenceModule(reference, "@duplojs/lang", /^dist\/string\//),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(moduleReference)) {
			return context.notSupport();
		}

		const { name } = moduleReference.symbol;

		// `Object.hasOwn` : un nom comme `toString` ne doit pas trouver `Object.prototype`.
		const stringFunction = Object.hasOwn(stringFunctions, name) ? stringFunctions[name] : undefined;

		if (stringFunction) {
			return stringFunctionHandler(node, stringFunction, context);
		}

		return DCommon.pipe(
			moduleReference.symbol.name,
			DPattern.match(
				DCommon.equal("to"),
				() => toExpressionHandler(node, context),
			),
			// Fonction du domaine pas encore traduite : `notfound-transformer` la signalera.
			DPattern.otherwise(
				() => context.notSupport(),
			),
		);
	},
);
