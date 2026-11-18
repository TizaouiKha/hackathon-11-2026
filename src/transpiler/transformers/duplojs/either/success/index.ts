import { type Transformer } from "@transformer";
import type { GoAST } from "@go";
import type { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { constructEither, requireCall } from "../core/construct";

/** `DEither.success(value)` -> `Either[T]{Tag: TagRightSuccess, Value: value}`. */
export async function successExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	const call = requireCall(node, context);

	if (DEither.isLeft(call)) {
		return call;
	}

	const callNode = DEither.unwrapRight(call);

	return constructEither(
		{
			call: callNode,
			side: "right",
			information: "success",
			value: DArray.first(callNode.arguments),
		},
		context,
	);
}
