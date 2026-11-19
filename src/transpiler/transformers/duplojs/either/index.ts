import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { createTransformer, type Transformer } from "@transformer";
import type { GoAST } from "@go";
import { TsAST } from "@typescript";
import type { BuildContext } from "../../../context/build";
import { successExpressionHandler } from "./success";
import { failExpressionHandler } from "./fail";
import { leftExpressionHandler, rightExpressionHandler } from "./left";
import { errorExpressionHandler } from "./error";
import { isRightExpressionHandler } from "./isRight";
import { isLeftExpressionHandler } from "./isLeft";
import { unwrapRightExpressionHandler } from "./unwrapRight";
import { whenIsRightOtherwiseExpressionHandler } from "./whenIsRightOtherwise";
import { matchInformationExpressionHandler } from "./matchInformation";
import { rightPipeExpressionHandler } from "./rightPipe";
import { whenIsRightExpressionHandler } from "./whenIsRight";
import { rightAsyncPipeExpressionHandler } from "./rightAsyncPipe";
import { asyncGroupExpressionHandler } from "./asyncGroup";
import { groupExpressionHandler } from "./group";

type EitherHandler = (
	node: TsAST.Node,
	context: BuildContext,
) => Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>>;

/**
 * Une fonction `DEither.*` par entrée. Une table plutôt qu'une chaîne de
 * `DPattern.match` dans un `DCommon.pipe`, limité à 16 arguments : le routeur en
 * aurait besoin de 17 depuis l'étape 10.
 */
const eitherHandlers: Readonly<Record<string, EitherHandler>> = {
	success: successExpressionHandler,
	fail: failExpressionHandler,
	left: leftExpressionHandler,
	right: rightExpressionHandler,
	error: errorExpressionHandler,
	isRight: isRightExpressionHandler,
	isLeft: isLeftExpressionHandler,
	unwrapRight: unwrapRightExpressionHandler,
	whenIsRight: whenIsRightExpressionHandler,
	whenIsRightOtherwise: whenIsRightOtherwiseExpressionHandler,
	matchInformation: matchInformationExpressionHandler,
	rightPipe: (node, context) => rightPipeExpressionHandler(node, context),
	rightAsyncPipe: rightAsyncPipeExpressionHandler,
	group: groupExpressionHandler,
	asyncGroup: asyncGroupExpressionHandler,
};

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

		const { name } = moduleReference.symbol;

		// `Object.hasOwn` : un nom comme `toString` ne doit pas trouver `Object.prototype`.
		const handler = Object.hasOwn(eitherHandlers, name) ? eitherHandlers[name] : undefined;

		return handler ? handler(node, context) : context.error(node);
	},
);
