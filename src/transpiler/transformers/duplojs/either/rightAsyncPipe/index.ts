import { type Transformer } from "@transformer";
import { type GoAST } from "@go";
import { type TsAST } from "@typescript";
import { type BuildContext } from "../../../../context/build";
import { rightPipeExpressionHandler } from "../rightPipe";

/**
 * D-11 : les promesses sont abaissées en valeurs synchrones. La sémantique de
 * propagation des Left reste celle de `rightPipe`; seuls les types Promise de
 * l'entrée et des callbacks sont déballés par le checker.
 */
export function rightAsyncPipeExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	return rightPipeExpressionHandler(node, context, true);
}
