import { type GoAST } from "@go";
import { type Transformer } from "@transformer";
import { type TsAST } from "@typescript";
import { type BuildContext } from "../../../../context/build";
import { pipeExpressionHandler } from "../pipe";

/** D-11 : chaque Promise étant abaissée en sa valeur, `asyncPipe` devient `pipe`. */
export function asyncPipeExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	return pipeExpressionHandler(node, context);
}
