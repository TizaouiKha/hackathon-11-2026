import { TsAST } from "@typescript";

/**
 * Déclaration qui n'existe que pour TypeScript : `type X = …` et
 * `interface X { … }` (exportées ou non). Elle ne produit **rien** en Go : le
 * checker lit déjà ces types partout où ils servent (`tsTypeToGo`, D-18), et un
 * objet devient un struct anonyme qui n'a pas besoin de nom.
 */
export function isTypeOnlyDeclaration(node: TsAST.Node) {
	return TsAST.isTypeAliasDeclaration(node) || TsAST.isInterfaceDeclaration(node);
}
