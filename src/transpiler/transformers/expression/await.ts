import * as DEither from "@duplojs/lang/either";
import { type GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { rawExpressionTransformers } from ".";

/**
 * D-11 : l'exécution générée est synchrone. `Promise<T>` est déjà traduit en
 * `T` par `tsTypeToGo`, donc `await expression` produit simplement
 * l'expression transformée et conserve ses éventuelles préparations.
 */
export const awaitExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		if (!TsAST.isAwaitExpression(node)) {
			return context.notSupport();
		}

		const expressionResult = await context.transform(node.expression, rawExpressionTransformers.value);
		if (DEither.isLeft(expressionResult)) {
			return expressionResult;
		}
		const expression = DEither.unwrapRight(expressionResult);

		return context.success(expression);
	},
);
