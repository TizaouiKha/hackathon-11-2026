import { type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { constructEither, requireCall } from "../core/construct";

/**
 * `DEither.left("negative-operand", value)`
 * -> `Either[T]{Tag: TagLeftNegativeOperand, Value: value}`.
 * L'information doit être un littéral : elle devient une constante de tag.
 */
export async function leftExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	const call = requireCall(node, context);

	if (DEither.isLeft(call)) {
		return call;
	}

	const callNode = DEither.unwrapRight(call);
	const information = DArray.first(callNode.arguments);

	if (
		!information
		|| (!TsAST.isStringLiteral(information) && !TsAST.isNoSubstitutionTemplateLiteral(information))
	) {
		return context.error(callNode, "either-information-must-be-a-string-literal");
	}

	return constructEither(
		{
			call: callNode,
			side: "left",
			information: information.text,
			value: DArray.at(callNode.arguments, 1),
		},
		context,
	);
}
