import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST, GoPrinter } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { expressionTransformers } from "../expression";
import { tsTypeOfNodeToGo } from "../type";
import { destructure } from "../expression/destructuring";

type VariableResult = GoAST.AssignmentStatement | GoAST.VariableDeclarationZeroValue;

export const variableStatementTransformer: Transformer<VariableResult> = createTransformer(
	async(node, context) => {
		if (!TsAST.isVariableStatement(node) || !DArray.lengthEqual(node.declarationList.declarations, 1)) {
			return context.notSupport();
		}

		const declaration = DArray.first(node.declarationList.declarations);

		// Déstructuration `const { a, b } = objet` / `const [x, y] = tuple` dans une fonction (D-19).
		if (
			declaration?.initializer
			&& (TsAST.isObjectBindingPattern(declaration.name) || TsAST.isArrayBindingPattern(declaration.name))
		) {
			if (TsAST.isSourceFile(node.parent)) {
				return context.error(node, "module-destructuring-not-supported-yet");
			}

			const source = await DCommon.asyncPipe(
				context.transform(declaration.initializer, expressionTransformers.value),
				DEither.unwrapRight,
			);
			if (DEither.isLeft(source)) {
				return source;
			}

			const sourceType = await tsTypeOfNodeToGo(declaration.initializer, context);
			if (DEither.isLeft(sourceType)) {
				return sourceType;
			}

			const sourceIdentifier = context.generateIdentifier();
			const variables = await destructure({
				pattern: declaration.name,
				source: sourceIdentifier,
				sourceType: DEither.unwrapRight(sourceType),
			}, context);
			if (DEither.isLeft(variables)) {
				return variables;
			}

			return context.success({
				before: DArray.concat(source.before, [
					GoAST.createShortVariableDeclarationStatement({
						identifier: sourceIdentifier,
						initializer: source.result,
					}),
				], DEither.unwrapRight(variables)),
				result: GoAST.createAssignmentStatement({
					targets: DCommon.cast([GoAST.createIdentifier("_")]),
					values: DCommon.cast([sourceIdentifier]),
				}),
			});
		}

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
			// Le type écrit en TS (`const raw: any = {…}`) fait foi : avec `raw := …`, Go
			// donnerait à la variable le type de la valeur, et l'adaptateur se tromperait
			// ensuite sur ce qu'elle contient (D-20).
			const declaredType = await tsTypeOfNodeToGo(declaration.name, context);
			if (DEither.isLeft(declaredType)) {
				return declaredType;
			}

			const valueType = await tsTypeOfNodeToGo(declaration.initializer, context);
			const declaredRendered = GoPrinter.renderNode(DEither.unwrapRight(declaredType));
			const sameType = DEither.isRight(valueType)
				&& GoPrinter.renderNode(DEither.unwrapRight(valueType)) === declaredRendered;

			return context.success({
				before: DArray.concat(initializer.before, [
					sameType
						? GoAST.createShortVariableDeclarationStatement({
							identifier,
							initializer: initializer.result,
						})
						: GoAST.createVariableDeclarationInitialized({
							identifier,
							typeReference: DEither.unwrapRight(declaredType),
							initializer: initializer.result,
						}),
				]),
				result: GoAST.createAssignmentStatement({
					targets: DCommon.cast([GoAST.createIdentifier("_")]),
					values: DCommon.cast([identifier]),
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
