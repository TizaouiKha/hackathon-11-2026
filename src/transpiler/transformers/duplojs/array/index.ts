import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { createTransformer, type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { TsAST } from "@typescript";
import type { BuildContext } from "../../../context/build";
import { coalescingExpressionHandler } from "./coalescing";
import { lengthHandler, predicateHandler, valuesHandler } from "./iteration";
import { mapExpressionHandler } from "./map";

type ArrayHandler = (
	node: TsAST.Node,
	context: BuildContext,
) => Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>>;

/** Une entrée par fonction `DArray` prise en charge (table : pas de limite d'arguments). */
const arrayHandlers: Record<string, ArrayHandler> = {
	map: mapExpressionHandler,
	coalescing: coalescingExpressionHandler,
	filter: predicateHandler("filter"),
	find: predicateHandler("find"),
	findIndex: predicateHandler("findIndex"),
	some: predicateHandler("some"),
	every: predicateHandler("every"),
	includes: valuesHandler("includes"),
	push: valuesHandler("push"),
	concat: valuesHandler("concat"),
	length: lengthHandler,
};

/**
 * Routeur du domaine `@duplojs/lang/array` (fonctions `DArray.*`, étape 8b).
 * Ajouter une entrée dans `arrayHandlers` par fonction prise en charge.
 */
export const duploJSArrayExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
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
			context.resolveReferenceModule(reference, "@duplojs/lang", /^dist\/array\//),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(moduleReference)) {
			return context.notSupport();
		}

		const { name } = moduleReference.symbol;

		// Fonction du domaine pas encore traduite : `notfound-transformer` la signalera.
		return Object.hasOwn(arrayHandlers, name)
			? arrayHandlers[name]!(node, context)
			: context.notSupport();
	},
);
