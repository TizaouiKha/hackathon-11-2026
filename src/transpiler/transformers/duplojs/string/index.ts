import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DPattern from "@duplojs/lang/pattern";
import { createTransformer, type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { TsAST } from "@typescript";
import { toExpressionHandler } from "./to";

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
