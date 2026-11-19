import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST, GoPrinter } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { TypeFlags } from "typescript/async";
import { tsTypeOfNodeToGo } from "../type";
import { go } from "../shared/goBuilder";
import { javascriptValue } from "./javascriptValues";
import { expressionTransformers } from ".";

/**
 * Opérateurs JavaScript sans équivalent direct en Go (D-19) :
 * | TypeScript | Go |
 * |---|---|
 * | `` `${a} et ${b}` `` | `JSToString(a) + " et " + JSToString(b)` (une chaîne passe telle quelle) |
 * | `typeof x` | `JSTypeOf(x)` (`"string"`, `"number"`, `"object"`…) ; `x` rétréci ensuite par l'adaptateur |
 * | `a ?? b` | `var r T; if JSIsNullish(a) { r = b } else { r = a }` : `b` n'est évalué que si besoin |
 */

type Result = Awaited<ReturnType<Transformer<GoAST.Expression>["transformer"]>>;

export const templateLiteralTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context): Promise<Result> => {
		if (TsAST.isNoSubstitutionTemplateLiteral(node)) {
			return context.success({ result: go.string(node.text) });
		}

		if (!TsAST.isTemplateExpression(node)) {
			return context.notSupport();
		}

		const before: GoAST.Statement[] = [];
		const parts: GoAST.Expression[] = node.head.text === "" ? [] : [go.string(node.head.text)];

		for (const span of node.templateSpans) {
			const value = await DCommon.asyncPipe(
				context.transform(span.expression, expressionTransformers.value),
				DEither.unwrapRight,
			);

			if (DEither.isLeft(value)) {
				return value;
			}

			const type = await context.transpilation.typeChecker.getTypeAtLocation(span.expression);
			const isString = (type.flags & TypeFlags.StringLike) !== 0;

			before.push(...value.before);
			parts.push(isString ? value.result : go.call(javascriptValue(context, "toString"), [value.result]));

			if (span.literal.text !== "") {
				parts.push(go.string(span.literal.text));
			}
		}

		const [head, ...rest] = parts;

		return context.success({
			before,
			result: rest.reduce<GoAST.Expression>(
				(left, right) => go.binary(left, "+", right),
				head ?? go.string(""),
			),
		});
	},
);

export const typeOfTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context): Promise<Result> => {
		if (!TsAST.isTypeOfExpression(node)) {
			return context.notSupport();
		}

		const value = await DCommon.asyncPipe(
			context.transform(node.expression, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(value)) {
			return value;
		}

		return context.success({
			before: value.before,
			result: go.call(javascriptValue(context, "typeOf"), [value.result]),
		});
	},
);

export const nullishCoalescingTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context): Promise<Result> => {
		if (!TsAST.isBinaryExpression(node) || node.operatorToken.kind !== TsAST.SyntaxKind.QuestionQuestionToken) {
			return context.notSupport();
		}

		const left = await DCommon.asyncPipe(
			context.transform(node.left, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(left)) {
			return left;
		}

		const right = await DCommon.asyncPipe(
			context.transform(node.right, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(right)) {
			return right;
		}

		const resultType = await tsTypeOfNodeToGo(node, context);

		if (DEither.isLeft(resultType)) {
			return resultType;
		}

		const goType = DEither.unwrapRight(resultType);
		const leftValue = context.generateIdentifier();
		const result = context.generateIdentifier();

		// La gauche est un `any` (elle peut être `null` / `undefined`) : on l'ouvre
		// avec le type du résultat quand celui-ci est précis.
		const opened = GoPrinter.renderNode(goType) === "any" ? leftValue : go.assert(leftValue, goType);

		return context.success({
			before: DArray.concat(left.before, [
				go.declare(leftValue.value, left.result),
				GoAST.createVariableDeclarationZeroValue({
					identifier: result,
					typeReference: goType,
				}),
				go.when(
					go.call(javascriptValue(context, "isNullish"), [leftValue]),
					[...right.before, go.assign([result], [right.result])],
					[go.assign([result], [opened])],
				),
			]),
			result,
		});
	},
);
