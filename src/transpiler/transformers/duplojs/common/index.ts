import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { createTransformer, type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { TsAST } from "@typescript";
import { pipeExpressionHandler } from "./pipe";
import { printExpressionHandler } from "./print";
import { asyncPipeExpressionHandler } from "./asyncPipe";
import { commonBasicsHandlers, type CommonHandler } from "./basics";

/** Une entrée par fonction `DCommon` prise en charge (table : pas de limite d'arguments). */
const commonHandlers: Record<string, CommonHandler> = {
	pipe: (node, context) => Promise.resolve(pipeExpressionHandler(node, context)),
	asyncPipe: (node, context) => Promise.resolve(asyncPipeExpressionHandler(node, context)),
	print: (node, context) => Promise.resolve(printExpressionHandler(node, context)),
	...commonBasicsHandlers,
};

/**
 * Routeur du domaine `@duplojs/lang/common` (fonctions `DCommon.*`).
 * Ajouter une entrée dans `commonHandlers` par fonction prise en charge.
 */
export const duploJSCommonExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
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
			context.resolveReferenceModule(reference, "@duplojs/lang", /^dist\/common\//),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(moduleReference)) {
			return context.notSupport();
		}

		const { name } = moduleReference.symbol;

		// Fonction du domaine pas encore traduite : `notfound-transformer` la signalera.
		return Object.hasOwn(commonHandlers, name)
			? commonHandlers[name]!(node, context)
			: context.notSupport();
	},
);
