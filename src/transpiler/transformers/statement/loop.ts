import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { TypeFlags } from "typescript/async";
import type { BuildContext } from "../../context/build";
import { expressionTransformers } from "../expression";
import { transformTruthiness } from "../expression/javascriptTruthiness";
import { go } from "../shared/goBuilder";
import { transformAssignment } from "./assignment";
import { statementTransformers } from ".";

/**
 * Boucles (D-19) :
 * | TypeScript | Go |
 * |---|---|
 * | `for (const v of tableau)` | `for _, v := range tableau` |
 * | `for (const c of texte)` | `for _, r := range texte { c := string(r) }` (1) |
 * | `while (c)` | `for c { … }`, ou `for { prépa ; if !c { break } ; … }` (2) |
 * | `for (let i = 0; i < n; i++)` | `for i := float64(0); i < n; i += 1` |
 * | `break`, `continue` | `break`, `continue` (aussi dans un `switch`, comme en JS) |
 * (1) Comme JS, on parcourt des **caractères** (points de code), pas des unités UTF-16.
 * (2) Si la condition a besoin d'instructions de préparation, elles sont placées
 *     dans le corps pour être **réévaluées à chaque tour**.
 * Refusés : `do … while`, `for … in`, les étiquettes.
 */

type Built = Awaited<ReturnType<Transformer<GoAST.Statement>["transformer"]>>;

/** Corps d'une boucle : un bloc Go, même si le corps TS est une seule instruction. */
async function transformBody(node: TsAST.Statement, context: BuildContext) {
	const transformed = await DCommon.asyncPipe(
		context.transform(node, statementTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(transformed)) {
		return transformed;
	}

	return DEither.success(DArray.concat(
		transformed.before,
		DModeling.hasTagValue(transformed.result, "[node][statement]block")
			? transformed.result.statements
			: [transformed.result],
	));
}

/** `_ = v` : Go refuse une variable déclarée et jamais lue, JS non. */
function markUsed(name: GoAST.Identifier) {
	return go.assign([go.id("_")], [name]);
}

function singleVariable(initializer: TsAST.ForInitializer | undefined) {
	if (!initializer || !TsAST.isVariableDeclarationList(initializer)) {
		return undefined;
	}

	const declaration = DArray.first(initializer.declarations);

	return declaration && initializer.declarations.length === 1 && TsAST.isIdentifier(declaration.name)
		? declaration
		: undefined;
}

export const forOfStatementTransformer: Transformer<GoAST.Statement> = createTransformer(
	async(node, context): Promise<Built> => {
		if (!TsAST.isForOfStatement(node)) {
			return context.notSupport();
		}

		const declaration = singleVariable(node.initializer);

		if (node.awaitModifier || !declaration || !TsAST.isIdentifier(declaration.name)) {
			return context.error(node, "for-of-supports-one-variable");
		}

		const iterable = await DCommon.asyncPipe(
			context.transform(node.expression, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(iterable)) {
			return iterable;
		}

		const body = await transformBody(node.statement, context);

		if (DEither.isLeft(body)) {
			return body;
		}

		const variable = context.createSourceIdentifier(declaration.name.text);
		const iterableType = await context.transpilation.typeChecker.getTypeAtLocation(node.expression);
		const isString = (iterableType.flags & TypeFlags.StringLike) !== 0;
		const character = context.generateIdentifier();

		return context.success({
			before: iterable.before,
			result: GoAST.createRangeStatement({
				binding: GoAST.createRangeDeclaration({
					key: go.id("_"),
					value: isString ? character : variable,
				}),
				expression: iterable.result,
				body: go.block([
					...isString ? [go.declare(variable.value, go.convert(go.types.string, character))] : [],
					markUsed(variable),
					...DEither.unwrapRight(body),
				]),
			}),
		});
	},
);

export const whileStatementTransformer: Transformer<GoAST.Statement> = createTransformer(
	async(node, context): Promise<Built> => {
		if (!TsAST.isWhileStatement(node)) {
			return context.notSupport();
		}

		const condition = await transformTruthiness(node.expression, context);

		if (DEither.isLeft(condition)) {
			return condition;
		}

		const body = await transformBody(node.statement, context);

		if (DEither.isLeft(body)) {
			return body;
		}

		const statements = DEither.unwrapRight(body);

		if (DArray.lengthEqual(condition.before, 0)) {
			return context.success({
				result: GoAST.createForStatement({
					condition: condition.condition,
					body: go.block(statements),
				}),
			});
		}

		return context.success({
			result: GoAST.createForStatement({
				body: go.block([
					...condition.before,
					go.when(go.not(condition.condition), [GoAST.createBreakStatement({})]),
					...statements,
				]),
			}),
		});
	},
);

export const forStatementTransformer: Transformer<GoAST.Statement> = createTransformer(
	async(node, context): Promise<Built> => {
		if (!TsAST.isForStatement(node)) {
			return context.notSupport();
		}

		const declaration = node.initializer ? singleVariable(node.initializer) : undefined;

		if (node.initializer && (!declaration?.initializer || !TsAST.isIdentifier(declaration.name))) {
			return context.error(node, "for-initializer-supports-one-variable");
		}

		const initial = declaration?.initializer
			? await DCommon.asyncPipe(
				context.transform(declaration.initializer, expressionTransformers.value),
				DEither.unwrapRight,
			)
			: undefined;

		if (initial && DEither.isLeft(initial)) {
			return initial;
		}

		const condition = node.condition ? await transformTruthiness(node.condition, context) : undefined;

		if (condition && DEither.isLeft(condition)) {
			return condition;
		}

		const increment = node.incrementor ? await transformAssignment(node.incrementor, context) : undefined;

		if (increment && DEither.isLeft(increment)) {
			return DEither.hasInformation(increment, "not-an-assignment")
				? context.error(node.incrementor ?? node, "for-incrementor-not-supported-yet")
				: increment;
		}

		const incrementStatement = increment && DEither.unwrapRight(increment);

		// L'incrément s'exécute après chaque tour, même après un `continue` : il ne
		// peut pas avoir d'instructions de préparation à placer ailleurs.
		if (incrementStatement && !DArray.lengthEqual(incrementStatement.before, 0)) {
			return context.error(node, "for-incrementor-too-complex-use-while");
		}

		const body = await transformBody(node.statement, context);

		if (DEither.isLeft(body)) {
			return body;
		}

		const variable = declaration && TsAST.isIdentifier(declaration.name)
			? context.createSourceIdentifier(declaration.name.text)
			: undefined;

		// Une condition qui a besoin de préparation est testée en tête du corps,
		// pour être **réévaluée à chaque tour** (un `continue` repasse par l'incrément).
		const preparedCondition = condition && !DArray.lengthEqual(condition.before, 0);

		return context.success({
			// La préparation de l'initialisation ne s'exécute qu'une fois, avant la boucle.
			before: initial?.before ?? [],
			result: GoAST.createForStatement({
				initializer: variable && initial
					? go.declare(variable.value, initial.result)
					: undefined,
				condition: preparedCondition ? undefined : condition?.condition,
				post: incrementStatement?.statement as GoAST.ForStatement["post"],
				body: go.block([
					...variable ? [markUsed(variable)] : [],
					...preparedCondition && condition
						? [...condition.before, go.when(go.not(condition.condition), [GoAST.createBreakStatement({})])]
						: [],
					...DEither.unwrapRight(body),
				]),
			}),
		});
	},
);

export const jumpStatementTransformer: Transformer<GoAST.Statement> = createTransformer(
	(node, context) => {
		if (TsAST.isBreakStatement(node) || TsAST.isContinueStatement(node)) {
			if (node.label) {
				return context.error(node, "labeled-jump-not-supported-yet");
			}

			return context.success({
				result: TsAST.isBreakStatement(node)
					? GoAST.createBreakStatement({})
					: GoAST.createContinueStatement({}),
			});
		}

		return context.notSupport();
	},
);
