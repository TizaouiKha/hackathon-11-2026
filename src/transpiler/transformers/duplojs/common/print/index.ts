import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { printSharedDependency } from "./sharedDependency";

export async function printExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node)) {
		if (!TsAST.isIdentifier(node) && !TsAST.isPropertyAccessExpression(node)) {
			return context.notSupport();
		}

		const packageName = context.registerSharedDependency(printSharedDependency.value);
		const printSelector = GoAST.createSelectorExpression({
			target: packageName,
			identifier: GoAST.createIdentifier("Print"),
		});

		if (TsAST.isCallExpression(node.parent) && node.parent.expression === node) {
			return context.success({
				result: GoAST.createInstantiationExpression({
					target: printSelector,
					typeArguments: DCommon.cast([GoAST.builtinTypeReferences.any]),
				}),
			});
		}

		return context.success({ result: printSelector });
	}

	if (node.arguments.length !== 1) {
		return context.error(node, "print-expects-one-argument");
	}

	const input = DArray.first(node.arguments);

	if (!input || TsAST.isSpreadElement(input)) {
		return context.error(node, "print-expects-one-argument");
	}

	const inputExpression = await DCommon.asyncPipe(
		context.transform(input, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(inputExpression)) {
		return inputExpression;
	}

	const packageName = context.registerSharedDependency(printSharedDependency.value);

	return context.success({
		before: inputExpression.before,
		result: GoAST.createCallExpression({
			callee: GoAST.createSelectorExpression({
				target: packageName,
				identifier: GoAST.createIdentifier("Print"),
			}),
			arguments: [inputExpression.result],
		}),
	});
}
