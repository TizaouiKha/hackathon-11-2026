import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from "../expression";
import { tsTypeOfNodeToGo } from "../type";

type VariableResult = GoAST.ShortVariableDeclarationStatement | GoAST.VariableDeclarationZeroValue;

export const variableStatementTransformer: Transformer<VariableResult> = createTransformer(
	async(node, context) => {
		if (!TsAST.isVariableStatement(node) || !DArray.lengthEqual(node.declarationList.declarations, 1)) {
			return context.notSupport();
		}

		const declaration = DArray.first(node.declarationList.declarations);
		if (!declaration || !TsAST.isIdentifier(declaration.name) || !declaration.initializer) {
			return context.error(node, "variable-declaration-must-have-one-identifier-and-an-initializer");
		}

		const initializer = await DCommon.asyncPipe(
			context.transform(declaration.initializer, expressionTransformers.value),
			DEither.unwrapRight,
		);
		if (DEither.isLeft(initializer)) {
			return initializer;
		}

		const identifier = context.createSourceIdentifier(declaration.name.text);
		if (!TsAST.isSourceFile(node.parent)) {
			return context.success({
				before: initializer.before,
				result: GoAST.createShortVariableDeclarationStatement({
					identifier,
					initializer: initializer.result,
				}),
			});
		}

		const variableType = await tsTypeOfNodeToGo(declaration.name, context);
		if (DEither.isLeft(variableType)) {
			return variableType;
		}

		return context.success({
			before: DArray.concat(
				initializer.before,
				[
					GoAST.createAssignmentStatement({
						targets: DCommon.cast([identifier]),
						values: DCommon.cast([initializer.result]),
					}),
				],
			),
			result: GoAST.createVariableDeclarationZeroValue({
				identifier,
				typeReference: DEither.unwrapRight(variableType),
			}),
		});
	},
);
