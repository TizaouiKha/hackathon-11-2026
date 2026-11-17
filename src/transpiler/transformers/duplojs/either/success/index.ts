import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { callExpressionTransformer } from "../../../shared";
import { typeTransformers } from "../../../type";
import { eitherSuccessDependency, successFunctionIdentifier, successTypeIdentifier } from "./sharedDependency";

export async function successExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (TsAST.isCallExpression(node)) {
		return context.transform(node, [callExpressionTransformer]);
	}

	// `EitherSuccessOf` est générique : Go ne peut pas l'affecter à une variable
	// sans instanciation. Le type est lu sur l'appel (`Success<T>`) via le checker.
	const call = node.parent;

	if (
		!call
		|| !TsAST.isCallExpression(call)
		|| call.expression.pos !== node.pos
		|| call.expression.end !== node.end
	) {
		return context.error(node, "success-reference-outside-call");
	}

	const { typeChecker } = context.transpilation;
	const callTypeNode = await typeChecker.typeToTypeNode(
		await typeChecker.getTypeAtLocation(call),
		call,
	);

	if (
		!callTypeNode
		|| (!TsAST.isTypeReferenceNode(callTypeNode) && !TsAST.isImportTypeNode(callTypeNode))
	) {
		return context.error(call, "unresolved-success-call-type");
	}

	const successType = await DCommon.asyncPipe(
		successTypeHandler(callTypeNode, context),
		DEither.keepAsRightByInformation("transformation-success"),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(successType)) {
		return DEither.hasInformation(successType, "transformation-not-supported")
			? context.error(call, "unsupported-success-call-type")
			: successType;
	}

	const packageName = context.registerSharedDependency(eitherSuccessDependency.value);

	return context.success({
		before: successType.before,
		result: GoAST.createInstantiationExpression({
			target: GoAST.createSelectorExpression({
				target: packageName,
				identifier: successFunctionIdentifier,
			}),
			typeArguments: successType.result.typeArguments,
		}),
	});
}

export async function successTypeHandler(
	node: TsAST.TypeReferenceNode | TsAST.ImportTypeNode,
	context: BuildContext,
) {
	const argumentNode = node.typeArguments && DArray.first(node.typeArguments);

	if (!argumentNode) {
		return context.notSupport();
	}

	const argument = await DCommon.asyncPipe(
		context.transform(argumentNode, typeTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(argument)) {
		return argument;
	}

	return context.success({
		before: argument.before,
		result: GoAST.createGenericTypeReference({
			typeReference: GoAST.createPackageTypeReference({
				packageName: context.registerSharedDependency(eitherSuccessDependency.value),
				identifier: successTypeIdentifier,
			}),
			typeArguments: DCommon.cast([argument.result]),
		}),
	});
}
