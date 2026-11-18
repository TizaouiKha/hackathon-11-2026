import { TsAST } from "@typescript";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import * as DCommon from "@duplojs/lang/common";
import * as DArray from "@duplojs/lang/array";
import { tsTypeToGo } from "../type";
import * as DEither from "@duplojs/lang/either";
import { TypeFlags } from "typescript/async";
import { blockStatementTransformer } from "../statement/block";

export const functionDeclarationTransformer: Transformer<GoAST.FunctionDeclaration> = createTransformer(
	async(node, context) => {
		if (!TsAST.isFunctionDeclaration(node) || !node.name || !node.body) {
			return context.notSupport();
		}

		const functionIdentifier = context.createSourceIdentifier(node.name.text);

		const { typeChecker } = context.transpilation;

		// Types des paramètres et du retour : toujours le type résolu par le checker
		// (écrit ou inféré), traduit par la couche centrale `tsTypeToGo` (D-18).
		const functionArguments = await DCommon.asyncPipe(
			node.parameters,
			DArray.map(
				async(parameters) => {
					if (!TsAST.isIdentifier(parameters.name)) {
						return context.error(parameters, "params-name-is-not-identifier");
					}

					const parameterType = await tsTypeToGo(
						await typeChecker.getTypeAtLocation(parameters.name),
						parameters,
						context,
					);

					if (DEither.isLeft(parameterType)) {
						return parameterType;
					}

					return GoAST.createFunctionArgument({
						identifier: context.createSourceIdentifier(parameters.name.text),
						type: DEither.unwrapRight(parameterType),
					});
				},
			),
			DCommon.promiseAll,
			DArray.reduce(
				DArray.reduceFrom<readonly GoAST.FunctionArgument[]>([]),
				({ element, lastValue, next, exit }) => {
					if (DEither.isLeft(element)) {
						return exit(element);
					}

					return next(
						DArray.push(
							lastValue,
							element,
						),
					);
				},
			),
		);

		if (DEither.isLeft(functionArguments)) {
			return functionArguments;
		}

		const tsReturnType = await typeChecker.getReturnTypeOfSignature(
			await typeChecker.getSignatureFromDeclaration(node),
		);

		// Une fonction `void` n'a pas de valeur de retour en Go (`undefined` en a une : JSUndefined).
		const returnsNothing = (tsReturnType.flags & TypeFlags.Void) !== 0;

		const returnType = returnsNothing
			? undefined
			: await tsTypeToGo(tsReturnType, node, context);

		if (returnType && DEither.isLeft(returnType)) {
			return returnType;
		}

		const body = await DCommon.asyncPipe(
			context.transform(node.body, [blockStatementTransformer]),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(body)) {
			return body;
		}

		if (!DArray.lengthEqual(body.before, 0)) {
			return context.error(node, "un-support-before-on-block-statement");
		}

		return context.success({
			result: GoAST.createFunctionDeclaration({
				identifier: functionIdentifier,
				arguments: functionArguments,
				returnTypes: returnType ? [DEither.unwrapRight(returnType)] : [],
				body: body.result,
				generic: [],
			}),
		});
	},
);
