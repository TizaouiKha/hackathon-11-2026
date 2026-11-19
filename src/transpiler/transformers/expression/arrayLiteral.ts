import * as DArray from "@duplojs/lang/array";
import * as DEither from "@duplojs/lang/either";
import * as DGenerator from "@duplojs/lang/generator";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { tsTypeOfNodeToGo } from "../type";
import { expressionTransformers } from ".";
import { sequenceOperands, type SequencedOperand } from "../shared/sequence";

export const arrayLiteralExpressionTransformer: Transformer<GoAST.CompositeLiteral> = createTransformer(
	async(node, context) => {
		if (!TsAST.isArrayLiteralExpression(node)) {
			return context.notSupport();
		}

		const elements = await DGenerator.asyncReduce(
			node.elements,
			DGenerator.reduceFrom<readonly SequencedOperand[]>([]),
			async({ item, lastValue, next, exit }) => {
				if (TsAST.isSpreadElement(item)) {
					return exit(context.error(item, "array-spread-not-supported-yet"));
				}

				const element = await context.transformPrepared(item, expressionTransformers.value);
				if (DEither.isLeft(element)) {
					return exit(element);
				}

				return next(DArray.push(lastValue, {
					node: item,
					...element,
				}));
			},
		);
		if (DEither.isLeft(elements)) {
			return elements;
		}
		const sequenced = await sequenceOperands(elements, context);

		const literalType = await tsTypeOfNodeToGo(node, context);
		if (DEither.isLeft(literalType)) {
			return literalType;
		}
		const typeReference = DEither.unwrapRight(literalType);

		let result: GoAST.CompositeLiteral | undefined = undefined;
		if (DModeling.hasTagValue(typeReference, "[node][type]slice")) {
			result = GoAST.createSliceLiteral({
				typeReference,
				elements: sequenced.operands,
			});
		} else if (DModeling.hasTagValue(typeReference, "[node][type]array")) {
			result = GoAST.createArrayLiteral({
				typeReference,
				elements: sequenced.operands,
			});
		} else if (DModeling.hasTagValue(typeReference, "[node][type]struct")) {
			result = GoAST.createStructLiteral({
				typeReference,
				elements: sequenced.operands,
			});
		}

		return result
			? context.success({
				before: sequenced.before,
				result,
			})
			: context.error(node, "array-literal-type-is-not-slice-array-or-tuple-struct");
	},
);
