import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { TypeFlags } from "typescript/async";
import { createTransformer, type Transformer } from "@transformer";
import { nullShardDependency, undefinedShardDependency } from "../../sharedDependency/defaults";

/**
 * Valeurs `null` et `undefined` (D-18) : des marqueurs de taille nulle, sans
 * allocation, que `print` sait afficher (`null` / `undefined`).
 * `null` -> `shard_dependencies.JSNull{}`, `undefined` -> `shard_dependencies.JSUndefined{}`.
 */
export const nullishLiteralTransformer: Transformer<GoAST.StructLiteral> = createTransformer(
	async(node, context) => {
		const isNull = node.kind === TsAST.SyntaxKind.NullKeyword;
		const isUndefined = !isNull
			&& TsAST.isIdentifier(node)
			&& node.text === "undefined"
			&& ((await context.transpilation.typeChecker.getTypeAtLocation(node)).flags & TypeFlags.Undefined) !== 0;

		if (!isNull && !isUndefined) {
			return context.notSupport();
		}

		return context.success({
			result: GoAST.createStructLiteral({
				typeReference: GoAST.createPackageTypeReference({
					packageName: context.registerSharedDependency(
						isNull ? nullShardDependency.value : undefinedShardDependency.value,
					),
					identifier: GoAST.createIdentifier(isNull ? "JSNull" : "JSUndefined"),
				}),
				elements: [],
			}),
		});
	},
);
