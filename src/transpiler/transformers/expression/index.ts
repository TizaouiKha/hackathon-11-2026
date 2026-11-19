import * as DCommon from "@duplojs/lang/common";
import { type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { duploJSExpressionTransformers } from "../duplojs";
import { identifierTransformer } from "../common";
import { numericLiteralTransformer } from "./numericLiteral";
import { sharedExpressionTransformers } from "../shared";
import { binaryExpressionTransformer } from "./binary";
import { nullishLiteralTransformer } from "./nullish";
import { createAdaptedExpressionTransformer } from "./adapt";
import { stringLiteralTransformer } from "./stringLiteral";
import { unaryExpressionTransformer } from "./unary";
import { parenthesizedExpressionTransformer } from "./parenthesized";
import { conditionalExpressionTransformer } from "./conditional";
import { arrowFunctionTransformer } from "./function";
import { arrayLiteralExpressionTransformer } from "./arrayLiteral";
import { awaitExpressionTransformer } from "./await";

/** Transformeurs bruts : chacun produit le Go du type TS de son expression. */
export const rawExpressionTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Expression>[] => [
		...duploJSExpressionTransformers.value,
		...sharedExpressionTransformers.value,
		nullishLiteralTransformer,
		identifierTransformer,
		numericLiteralTransformer,
		stringLiteralTransformer,
		parenthesizedExpressionTransformer,
		unaryExpressionTransformer,
		conditionalExpressionTransformer,
		arrowFunctionTransformer,
		arrayLiteralExpressionTransformer,
		awaitExpressionTransformer,
		binaryExpressionTransformer,
	],
);

/**
 * Point d'entrée de toutes les expressions : résultat adapté au type attendu
 * (narrowing, élargissement vers un Either, D-18 phase 2).
 */
const adaptedExpressionTransformer = createAdaptedExpressionTransformer(() => rawExpressionTransformers.value);

export const expressionTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Expression>[] => [adaptedExpressionTransformer],
);
