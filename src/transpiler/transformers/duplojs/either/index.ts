import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { createTransformer, type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DPattern from "@duplojs/lang/pattern";
import { successExpressionHandler } from "./success";
import { failExpressionHandler } from "./fail";
import { leftExpressionHandler } from "./left";
import { isRightExpressionHandler } from "./isRight";
import { whenIsRightOtherwiseExpressionHandler } from "./whenIsRightOtherwise";
import { matchInformationExpressionHandler } from "./matchInformation";
import { rightPipeExpressionHandler } from "./rightPipe";
import { whenIsRightExpressionHandler } from "./whenIsRight";
import { eitherTypeHandler } from "./core/type";

export const duploJSEitherDeclarationTransformer: Transformer<GoAST.Declaration> = createTransformer(
	(_node, context) => context.notSupport(),
);

export const duploJSEitherExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		const reference = TsAST.isCallExpression(node)
			? node.expression
			: node;

		if (
			!TsAST.isIdentifier(reference)
			&& !TsAST.isPropertyAccessExpression(reference)
		) {
			return context.notSupport();
		}

		const moduleReference = await DCommon.asyncPipe(
			context.resolveReferenceModule(reference, "@duplojs/lang", /^dist\/either\//),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(moduleReference)) {
			return context.notSupport();
		}

		return DCommon.pipe(
			moduleReference.symbol.name,
			DPattern.match(
				DCommon.equal("success"),
				() => successExpressionHandler(node, context),
			),
			DPattern.match(
				DCommon.equal("fail"),
				() => failExpressionHandler(node, context),
			),
			DPattern.match(
				DCommon.equal("left"),
				() => leftExpressionHandler(node, context),
			),
			DPattern.match(
				DCommon.equal("isRight"),
				() => isRightExpressionHandler(node, context),
			),
			DPattern.match(
				DCommon.equal("whenIsRight"),
				() => whenIsRightExpressionHandler(node, context),
			),
			DPattern.match(
				DCommon.equal("whenIsRightOtherwise"),
				() => whenIsRightOtherwiseExpressionHandler(node, context),
			),
			DPattern.match(
				DCommon.equal("matchInformation"),
				() => matchInformationExpressionHandler(node, context),
			),
			DPattern.match(
				DCommon.equal("rightPipe"),
				() => rightPipeExpressionHandler(node, context),
			),
			DPattern.otherwise(
				() => context.error(node),
			),
		);
	},
);

/**
 * Types Either : un membre seul (`Success<number>`) ou une union contenant au
 * moins un type Either (`Fail | Success<number>`, ou `number | Fail` avec une
 * valeur brute, D-16), parenthèses comprises.
 */
export const duploJSEitherTypeTransformer: Transformer<GoAST.GenericTypeReference> = createTransformer(
	(node, context) => {
		if (!TsAST.isTypeNode(node)) {
			return context.notSupport();
		}

		return eitherTypeHandler(node, context);
	},
);
