import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DGenerator from "@duplojs/lang/generator";
import * as DModeling from "@duplojs/lang/modeling";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";

/**
 * Valeur d'étape déjà « pure » (un nom de fonction) : inutile de la ranger dans
 * une variable temporaire avant l'appel.
 */
function isStableExpression(expression: GoAST.Expression) {
	return DModeling.hasTagValue(expression, ["[node]identifier", "[node][expression]selector"]);
}

/**
 * `DCommon.pipe(input, f, g)` est **déroulé à la compilation** (D-10) : Go n'a
 * pas de génériques variadiques, un helper `Pipe` est donc impossible.
 * ```go
 * Generated_1 := f(input)
 * Generated_2 := g(Generated_1)
 * // résultat : Generated_2
 * ```
 * Ordre d'évaluation conservé : comme en TypeScript, l'entrée puis toutes les
 * étapes sont évaluées avant les appels. Une étape qui n'est pas un simple nom
 * de fonction (par exemple une forme curryfiée `DEither.whenIsRight(f)`, qui
 * devient une fonction Go) est d'abord rangée dans une variable.
 */
export async function pipeExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node) || node.arguments.length < 2) {
		return context.error(node, "pipe-expects-an-input-and-steps");
	}

	const [input, ...steps] = node.arguments as unknown as [TsAST.Expression, ...TsAST.Expression[]];

	const inputExpression = await DCommon.asyncPipe(
		context.transform(input, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(inputExpression)) {
		return inputExpression;
	}

	const inputVariable = GoAST.createShortVariableDeclarationStatement({
		identifier: context.generateIdentifier(),
		initializer: inputExpression.result,
	});

	// 1. Évaluer chaque étape (la fonction), dans l'ordre d'écriture.
	const stepFunctions = await DCommon.asyncPipe(
		steps,
		DGenerator.asyncReduce(
			DGenerator.reduceFrom<{
				before: readonly GoAST.Statement[];
				functions: readonly GoAST.Expression[];
			}>({
				before: DArray.concat(inputExpression.before, [inputVariable]),
				functions: [],
			}),
			async({ item, lastValue, next, exit }) => {
				const step = await DCommon.asyncPipe(
					context.transform(item, expressionTransformers.value),
					DEither.unwrapRight,
				);

				if (DEither.isLeft(step)) {
					return exit(step);
				}

				if (isStableExpression(step.result)) {
					return next({
						before: DArray.concat(lastValue.before, step.before),
						functions: DArray.push(lastValue.functions, step.result),
					});
				}

				const stepVariable = GoAST.createShortVariableDeclarationStatement({
					identifier: context.generateIdentifier(),
					initializer: step.result,
				});

				return next({
					before: DArray.concat(lastValue.before, step.before, [stepVariable]),
					functions: DArray.push(lastValue.functions, stepVariable.identifier),
				});
			},
		),
	);

	if (DEither.isLeft(stepFunctions)) {
		return stepFunctions;
	}

	// 2. Appeler les étapes en chaîne : chacune reçoit le résultat de la précédente.
	const chained = DArray.reduce(
		stepFunctions.functions,
		DArray.reduceFrom<{
			before: readonly GoAST.Statement[];
			value: GoAST.Identifier;
		}>({
			before: stepFunctions.before,
			value: inputVariable.identifier,
		}),
		({ element, lastValue, next }) => {
			const resultVariable = GoAST.createShortVariableDeclarationStatement({
				identifier: context.generateIdentifier(),
				initializer: GoAST.createCallExpression({
					callee: element,
					arguments: [lastValue.value],
				}),
			});

			return next({
				before: DArray.push(lastValue.before, resultVariable),
				value: resultVariable.identifier,
			});
		},
	);

	return context.success({
		before: chained.before,
		result: chained.value,
	});
}
