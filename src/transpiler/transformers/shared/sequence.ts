import * as DModeling from "@duplojs/lang/modeling";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import { SymbolFlags } from "typescript/async";
import type { BuildContext } from "../../context/build";

/**
 * Ordre d'évaluation des opérandes (R-01, n° 2).
 *
 * JavaScript évalue les opérandes de gauche à droite : dans `f(x, change())`,
 * `x` est lu **avant** l'appel de `change()`. Le transpileur, lui, sort les
 * calculs d'un opérande dans des instructions placées avant l'expression
 * (`Generated_1 := Sourced_change()`), puis lit `x` dans l'appel :
 * ```go
 * Generated_1 := Sourced_change()
 * Sourced_f(Sourced_x, Generated_1) // x lu après change() : faux
 * ```
 * Règle : quand un opérande a des instructions préparatoires, chaque opérande
 * précédent qui pourrait changer entre-temps est d'abord copié dans une variable :
 * ```go
 * Generated_2 := Sourced_x
 * Generated_1 := Sourced_change()
 * Sourced_f(Generated_2, Generated_1)
 * ```
 * Ne sont **pas** copiés (leur valeur ne peut pas changer) : les littéraux, les
 * variables temporaires générées, les `const`, les fonctions, les imports, et les
 * `let` / paramètres jamais réaffectés dans leur fichier.
 */

export interface SequencedOperand {
	readonly node: TsAST.Node;
	readonly before: readonly GoAST.Statement[];
	readonly operand: GoAST.Expression;
}

export interface SequencedOperands {
	readonly before: readonly GoAST.Statement[];
	readonly operands: readonly GoAST.Expression[];
}

const literalTags = [
	"[node][expression]literal-integer",
	"[node][expression]literal-float",
	"[node][expression]literal-imaginary",
	"[node][expression]literal-rune",
	"[node][expression]literal-string",
	"[node][expression]literal-boolean",
	"[node][expression]literal-nil",
] as const;

function isLiteral(expression: GoAST.Expression) {
	return DModeling.hasTagValue(expression, literalTags)
		|| (DModeling.hasTagValue(expression, "[node][expression]conversion")
			&& DModeling.hasTagValue(expression.operand, literalTags));
}

function isUpdateOperator(kind: TsAST.SyntaxKind) {
	return kind === TsAST.SyntaxKind.PlusPlusToken || kind === TsAST.SyntaxKind.MinusMinusToken;
}

function mentions(node: TsAST.Node, name: string): boolean {
	if (TsAST.isIdentifier(node)) {
		return node.text === name;
	}

	return node.forEachChild((child) => mentions(child, name) || undefined) ?? false;
}

/**
 * `name` est-il réaffecté quelque part sous `root` (`=`, `+=`, `++`, déstructuration) ?
 * Comparaison par nom : un homonyme d'une autre portée compte aussi. On copie
 * alors parfois pour rien, mais jamais l'inverse.
 */
function isReassigned(root: TsAST.Node, name: string): boolean {
	const found = root.forEachChild((node) => {
		if (
			TsAST.isBinaryExpression(node)
			&& node.operatorToken.kind >= TsAST.SyntaxKind.FirstAssignment
			&& node.operatorToken.kind <= TsAST.SyntaxKind.LastAssignment
			&& mentions(node.left, name)
		) {
			return true;
		}

		if (
			(TsAST.isPrefixUnaryExpression(node) || TsAST.isPostfixUnaryExpression(node))
			&& isUpdateOperator(node.operator)
			&& mentions(node.operand, name)
		) {
			return true;
		}

		return isReassigned(node, name) || undefined;
	});

	return found ?? false;
}

/** Variable dont la valeur peut changer pendant l'évaluation d'une expression. */
async function isMutableVariable(node: TsAST.Identifier, context: BuildContext) {
	const { typeChecker } = context.transpilation;
	// `{ x }` : le symbole lu est la variable `x`, pas la propriété.
	const symbol = TsAST.isShorthandPropertyAssignment(node.parent)
		? await typeChecker.getShorthandAssignmentValueSymbol(node.parent)
		: await typeChecker.getSymbolAtLocation(node);

	if (!symbol || symbol.flags & SymbolFlags.Alias) {
		// Import : JS interdit de l'affecter depuis ce fichier.
		return false;
	}

	const declaration = await symbol.valueDeclaration?.resolve();

	if (!declaration) {
		return false;
	}

	const isLet = TsAST.isVariableDeclaration(declaration)
		&& TsAST.isVariableDeclarationList(declaration.parent)
		&& !(declaration.parent.flags & TsAST.NodeFlags.Const);

	if (!isLet && !TsAST.isParameterDeclaration(declaration)) {
		return false;
	}

	return isReassigned(declaration.getSourceFile(), node.text);
}

async function isStable(item: SequencedOperand, context: BuildContext) {
	if (isLiteral(item.operand)) {
		return true;
	}

	if (TsAST.isIdentifier(item.node)) {
		return !await isMutableVariable(item.node, context);
	}

	// Un identifiant Go issu d'une autre expression TS : une variable temporaire.
	return DModeling.hasTagValue(item.operand, "[node]identifier");
}

/**
 * Assemble des opérandes préparés **dans l'ordre de JavaScript** : instructions
 * concaténées, et copie des opérandes précédents quand un opérande suivant a des
 * instructions préparatoires.
 */
export async function sequenceOperands(
	items: readonly SequencedOperand[],
	context: BuildContext,
): Promise<SequencedOperands> {
	const before: GoAST.Statement[] = [];
	const operands: GoAST.Expression[] = [];
	const stable: boolean[] = [];

	for (const item of items) {
		if (item.before.length > 0) {
			for (const [index, operand] of operands.entries()) {
				stable[index] ??= await isStable(items[index]!, context);

				if (!stable[index]) {
					const copy = context.generateIdentifier();

					before.push(GoAST.createShortVariableDeclarationStatement({
						identifier: copy,
						initializer: operand,
					}));
					operands[index] = copy;
					stable[index] = true;
				}
			}
		}

		before.push(...item.before);
		operands.push(item.operand);
	}

	return {
		before,
		operands,
	};
}
