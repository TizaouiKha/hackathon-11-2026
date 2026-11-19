import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { createTransformer, type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { TsAST } from "@typescript";
import { duploJSTypeTransformers } from "../duplojs";
import { sharedTypeTransformers } from "../shared";
import { tsTypeToGo } from "./tsTypeToGo";

export * from "./tsTypeToGo";

/**
 * Nœud de type écrit dans la source (`(one: number)`, `: DEither.Success<number>`)
 * -> type Go, via la couche centrale `tsTypeToGo` (D-18). Le checker résout le
 * nœud en `Type` ; toutes les règles de traduction sont dans `tsTypeToGo`.
 */
export const typeNodeTransformer: Transformer<GoAST.Type | GoAST.TypeReference> = createTransformer(
	async(node, context) => {
		if (!TsAST.isTypeNode(node)) {
			return context.notSupport();
		}

		const goType = await tsTypeToGo(
			await context.transpilation.typeChecker.getTypeFromTypeNode(node),
			node,
			context,
		);

		if (DEither.isLeft(goType)) {
			return goType;
		}

		return context.success({ result: DEither.unwrapRight(goType) });
	},
);

export const typeTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Type | GoAST.TypeReference>[] => [
		...duploJSTypeTransformers.value,
		...sharedTypeTransformers.value,
		typeNodeTransformer,
	],
);
