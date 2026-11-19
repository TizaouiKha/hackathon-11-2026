import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";

/** `true` / `false` écrits dans le code : les mêmes littéraux en Go (D-20). */
export const booleanLiteralTransformer: Transformer<GoAST.BooleanLiteral> = createTransformer(
	(node, context) => {
		if (node.kind !== TsAST.SyntaxKind.TrueKeyword && node.kind !== TsAST.SyntaxKind.FalseKeyword) {
			return context.notSupport();
		}

		return context.success({
			result: GoAST.createBooleanLiteral({ value: node.kind === TsAST.SyntaxKind.TrueKeyword }),
		});
	},
);
