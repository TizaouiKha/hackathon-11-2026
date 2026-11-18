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

/** Transformeurs bruts : chacun produit le Go du type TS de son expression. */
export const rawExpressionTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Expression>[] => [
		...duploJSExpressionTransformers.value,
		...sharedExpressionTransformers.value,
		nullishLiteralTransformer,
		identifierTransformer,
		numericLiteralTransformer,
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
