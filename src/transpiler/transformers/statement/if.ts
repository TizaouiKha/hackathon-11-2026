import * as DArray from "@duplojs/lang/array";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from "../expression";
import { statementTransformers } from ".";

async function transformBranch(node: TsAST.Statement, context: Parameters<Transformer<GoAST.IfStatement>["transformer"]>[1]) {
	const transformed = DEither.unwrapRight(await context.transform(node, statementTransformers.value));
	if (DEither.isLeft(transformed)) {
		return transformed;
	}

	const statements = DArray.concat(
		transformed.before,
		DModeling.hasTagValue(transformed.result, "[node][statement]block")
			? transformed.result.statements
			: [transformed.result],
	);

	return GoAST.createBlockStatement({ statements });
}

export const ifStatementTransformer: Transformer<GoAST.IfStatement> = createTransformer(
	async(node, context) => {
		if (!TsAST.isIfStatement(node)) {
			return context.notSupport();
		}

		const condition = await context.transformPrepared(node.expression, expressionTransformers.value);
		if (DEither.isLeft(condition)) {
			return condition;
		}

		const body = await transformBranch(node.thenStatement, context);
		if (DEither.isLeft(body)) {
			return body;
		}

		const elseBranch = node.elseStatement
			? await transformBranch(node.elseStatement, context)
			: undefined;
		if (elseBranch && DEither.isLeft(elseBranch)) {
			return elseBranch;
		}

		return context.success({
			before: condition.before,
			result: GoAST.createIfStatement({
				condition: condition.operand,
				body,
				elseBranch,
			}),
		});
	},
);
