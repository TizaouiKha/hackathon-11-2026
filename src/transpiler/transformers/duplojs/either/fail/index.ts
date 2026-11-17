import { type Transformer } from "@transformer";
import type { GoAST } from "@go";
import type { TsAST } from "@typescript";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { constructEither, requireCall } from "../core/construct";

/** `DEither.fail()` -> `Either[T]{Tag: TagLeftFail}` (valeur `undefined`). */
export async function failExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	const call = requireCall(node, context);

	if (DEither.isLeft(call)) {
		return call;
	}

	return constructEither(
		{
			call: DEither.unwrapRight(call),
			side: "left",
			information: "fail",
			value: undefined,
		},
		context,
	);
}
