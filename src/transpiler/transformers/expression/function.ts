import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { TypeFlags, type Symbol } from "typescript/async";
import { blockStatementTransformer } from "../statement/block";
import { tsTypeToGo } from "../type";
import { expressionTransformers } from ".";

interface TransformedParameter {
	argument: GoAST.FunctionArgument;
	prefix: readonly GoAST.Statement[];
}

function collectIdentifiers(node: TsAST.Node, identifiers: TsAST.Identifier[] = []) {
	if (TsAST.isIdentifier(node)) {
		identifiers.push(node);
	}
	for (const child of node.getChildren()) {
		collectIdentifiers(child, identifiers);
	}
	return identifiers;
}

async function collectUsedSymbols(
	node: TsAST.Node,
	context: Parameters<Transformer<GoAST.FunctionLiteral>["transformer"]>[1],
) {
	const symbols = await DCommon.asyncPipe(
		collectIdentifiers(node),
		DArray.map((identifier) => context.transpilation.typeChecker.getSymbolAtLocation(identifier)),
		DCommon.promiseAll,
	);
	const usedSymbols = new Set<Symbol>();
	for (const symbol of symbols) {
		if (symbol) {
			usedSymbols.add(symbol);
		}
	}
	return usedSymbols;
}

async function transformParameter(
	parameter: TsAST.ParameterDeclaration,
	context: Parameters<Transformer<GoAST.FunctionLiteral>["transformer"]>[1],
	usedSymbols: ReadonlySet<Symbol>,
) {
	if (parameter.dotDotDotToken || parameter.initializer) {
		return context.error(parameter, "rest-and-default-arrow-parameters-not-supported-yet");
	}

	const parameterType = await tsTypeToGo(
		await context.transpilation.typeChecker.getTypeAtLocation(parameter.name),
		parameter,
		context,
	);
	if (DEither.isLeft(parameterType)) {
		return parameterType;
	}
	const goType = DEither.unwrapRight(parameterType);

	if (TsAST.isIdentifier(parameter.name)) {
		return DEither.success<TransformedParameter>({
			argument: GoAST.createFunctionArgument({
				identifier: context.createSourceIdentifier(parameter.name.text),
				type: goType,
			}),
			prefix: [],
		});
	}

	if (!TsAST.isArrayBindingPattern(parameter.name)) {
		return context.error(parameter, "arrow-parameter-binding-pattern-not-supported");
	}

	const argumentIdentifier = context.generateIdentifier();
	const prefix: GoAST.Statement[] = [];
	for (const [index, element] of parameter.name.elements.entries()) {
		if (TsAST.isOmittedExpression(element)) {
			return context.error(element, "tuple-binding-element-not-supported");
		}
		if (
			!element.name
			|| !TsAST.isIdentifier(element.name)
			|| element.dotDotDotToken
			|| element.initializer
		) {
			return context.error(element, "tuple-binding-element-not-supported");
		}
		const elementSymbol = await context.transpilation.typeChecker.getSymbolAtLocation(element.name);
		if (!elementSymbol || !usedSymbols.has(elementSymbol)) {
			continue;
		}

		const initializer = DModeling.hasTagValue(goType, "[node][type]struct")
			? GoAST.createSelectorExpression({
				target: argumentIdentifier,
				identifier: GoAST.createIdentifier(`V${index}`),
			})
			: GoAST.createIndexExpression({
				target: argumentIdentifier,
				index: GoAST.createIntegerLiteral({ value: BigInt(index) }),
			});

		prefix.push(GoAST.createShortVariableDeclarationStatement({
			identifier: context.createSourceIdentifier(element.name.text),
			initializer,
		}));
	}

	return DEither.success<TransformedParameter>({
		argument: GoAST.createFunctionArgument({
			identifier: argumentIdentifier,
			type: goType,
		}),
		prefix,
	});
}

export const arrowFunctionTransformer: Transformer<GoAST.FunctionLiteral> = createTransformer(
	async(node, context) => {
		if (!TsAST.isArrowFunction(node)) {
			return context.notSupport();
		}

		const usedSymbols = await collectUsedSymbols(node.body, context);
		const parameters = await DCommon.asyncPipe(
			node.parameters,
			DArray.map((parameter) => transformParameter(parameter, context, usedSymbols)),
			DCommon.promiseAll,
		);
		const failedParameter = DArray.find(parameters, DEither.isLeft);
		if (failedParameter) {
			return failedParameter;
		}
		const transformedParameters = parameters as readonly DEither.Right<"success", TransformedParameter>[];
		const values = transformedParameters.map(DEither.unwrapRight);
		const argumentsList = values.map(({ argument }) => argument);
		const prefix = values.flatMap(({ prefix: parameterPrefix }) => parameterPrefix);

		const signature = await context.transpilation.typeChecker.getSignatureFromDeclaration(node);
		if (!signature) {
			return context.error(node, "arrow-function-without-signature");
		}
		const tsReturnType = await context.transpilation.typeChecker.getReturnTypeOfSignature(signature);
		const returnsNothing = (tsReturnType.flags & TypeFlags.Void) !== 0;
		const returnType = returnsNothing ? undefined : await tsTypeToGo(tsReturnType, node, context);
		if (returnType && DEither.isLeft(returnType)) {
			return returnType;
		}

		let body = GoAST.createBlockStatement({ statements: [] });
		if (TsAST.isBlock(node.body)) {
			const transformedBody = DEither.unwrapRight(
				await context.transform(node.body, [blockStatementTransformer]),
			);
			if (DEither.isLeft(transformedBody)) {
				return transformedBody;
			}
			body = GoAST.createBlockStatement({
				statements: DArray.concat(prefix, transformedBody.before, transformedBody.result.statements),
			});
		} else if (returnsNothing) {
			const expressionBody = DEither.unwrapRight(
				await context.transform(node.body, expressionTransformers.value),
			);
			if (DEither.isLeft(expressionBody)) {
				return expressionBody;
			}
			if (!DModeling.hasTagGroup(expressionBody.result, "statement")) {
				return context.error(node.body, "void-expression-does-not-produce-a-go-statement");
			}
			body = GoAST.createBlockStatement({
				statements: DArray.concat(prefix, expressionBody.before, [expressionBody.result]),
			});
		} else {
			const expressionBody = DEither.unwrapRight(
				await context.transform(node.body, expressionTransformers.value),
			);
			if (DEither.isLeft(expressionBody)) {
				return expressionBody;
			}
			body = GoAST.createBlockStatement({
				statements: DArray.concat(
					prefix,
					expressionBody.before,
					[GoAST.createReturnStatement({ values: [expressionBody.result] })],
				),
			});
		}

		return context.success({
			result: GoAST.createFunctionLiteral({
				arguments: argumentsList,
				returnTypes: returnType ? [DEither.unwrapRight(returnType)] : [],
				body,
			}),
		});
	},
);
