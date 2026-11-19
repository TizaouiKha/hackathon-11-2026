import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { mathImportDeclaration } from "./javascriptNumber";

type NumericLiteralResultNode = GoAST.ConversionExpression | GoAST.CallExpression;

export const numericLiteralTransformer: Transformer<NumericLiteralResultNode> = createTransformer(
	(node, context) => {
		if (!TsAST.isNumericLiteral(node)) {
			return context.notSupport();
		}

		// Un littéral trop grand (`1e400`) vaut Infinity en JavaScript ; TypeScript
		// donne alors le texte "Infinity". Une constante Go qui dépasse float64 ne
		// compile pas : on produit `math.Inf(1)`.
		if (!Number.isFinite(Number(node.text))) {
			context.file.imports.add(mathImportDeclaration.value);

			return context.success({
				result: GoAST.createCallExpression({
					callee: GoAST.createSelectorExpression({
						target: GoAST.createIdentifier("math"),
						identifier: GoAST.createIdentifier("Inf"),
					}),
					arguments: [GoAST.createIntegerLiteral({ value: 1n })],
				}),
			});
		}

		return context.success({
			result: GoAST.createConversionExpression({
				typeReference: GoAST.builtinTypeReferences.float64,
				operand: GoAST.createFloatLiteral({ value: node.text }),
			}),
		});
	},
);
