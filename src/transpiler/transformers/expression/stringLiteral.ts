import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";

export const stringLiteralTransformer: Transformer<GoAST.StringLiteral> = createTransformer(
	(node, context) => {
		if (!TsAST.isStringLiteral(node) && !TsAST.isNoSubstitutionTemplateLiteral(node)) {
			return context.notSupport();
		}

		return context.success({
			result: GoAST.createStringLiteral({ value: node.text }),
		});
	},
);
