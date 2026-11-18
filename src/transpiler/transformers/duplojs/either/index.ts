import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { createTransformer, type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DPattern from "@duplojs/lang/pattern";
import * as DArray from "@duplojs/lang/array";
import { successExpressionHandler } from "./success";
import { failExpressionHandler } from "./fail";
import { leftExpressionHandler } from "./left";
import { isRightExpressionHandler } from "./isRight";
import { whenIsRightOtherwiseExpressionHandler } from "./whenIsRightOtherwise";
import { matchInformationExpressionHandler } from "./matchInformation";
import { rightPipeExpressionHandler } from "./rightPipe";
import { eitherTypeHandler, isEitherMemberCandidate, resolveEitherTypeName, unwrapParenthesizedType } from "./core/type";

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

const eitherTypeNames: readonly string[] = ["Success", "Fail", "Left", "Right"];

/**
 * Types Either : un membre seul (`Success<number>`) ou une union dont tous les
 * membres sont des types Either (`Fail | Success<number>`), parenthèses comprises.
 */
export const duploJSEitherTypeTransformer: Transformer<GoAST.GenericTypeReference> = createTransformer(
	async(node, context) => {
		if (!TsAST.isTypeNode(node)) {
			return context.notSupport();
		}

		const unwrapped = unwrapParenthesizedType(node);
		const candidates = TsAST.isUnionTypeNode(unwrapped)
			? unwrapped.types
			: [unwrapped];
		const members = DArray.filter(candidates, isEitherMemberCandidate);

		if (members.length !== candidates.length) {
			return context.notSupport();
		}

		const names = await DCommon.asyncPipe(
			members,
			DArray.map((member) => resolveEitherTypeName(member, context)),
			DCommon.promiseAll,
		);

		if (!DArray.every(names, (name) => name !== undefined && DArray.includes(eitherTypeNames, name))) {
			return context.notSupport();
		}

		return eitherTypeHandler(unwrapped, members, context);
	},
);
