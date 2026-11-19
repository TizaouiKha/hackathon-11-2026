import * as DCommon from "@duplojs/lang/common";
import { duploJSEitherDeclarationTransformer, duploJSEitherExpressionTransformer } from "./either";
import { duploJSCommonExpressionTransformer } from "./common";
import { duploJSStringExpressionTransformer } from "./string";
import { duploJSArrayExpressionTransformer } from "./array";
import { duploJSObjectExpressionTransformer } from "./object";
import { duploJSNumberExpressionTransformer } from "./number";
import type { GoAST } from "@go";
import { type Transformer } from "@transformer";

export const duploJSDeclarationTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Declaration>[] => [duploJSEitherDeclarationTransformer],
);
export const duploJSExpressionTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Expression>[] => [
		duploJSEitherExpressionTransformer,
		duploJSCommonExpressionTransformer,
		duploJSStringExpressionTransformer,
		duploJSArrayExpressionTransformer,
		duploJSObjectExpressionTransformer,
		duploJSNumberExpressionTransformer,
	],
);
export const duploJSStatementTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Statement>[] => [],
);
export const duploJSTypeTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Type | GoAST.TypeReference>[] => [],
);
