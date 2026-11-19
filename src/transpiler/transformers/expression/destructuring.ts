import * as DEither from "@duplojs/lang/either";
import { GoAST, GoPrinter } from "@go";
import { TsAST } from "@typescript";
import type { Symbol } from "typescript/async";
import type { BuildContext } from "../../context/build";
import { tsTypeToGo, type GoType } from "../type/tsTypeToGo";
import { go } from "../shared/goBuilder";
import { javascriptValue } from "./javascriptValues";

/**
 * Déstructuration (D-19), pour un paramètre de fonction fléchée comme pour un
 * `const` : chaque nom devient une variable Go lue sur la source.
 * | TypeScript | Go |
 * |---|---|
 * | `[a, b]` (tableau, tuple) | `a := p[0]` ; `p[1].(T)` si la slice est un `[]any` |
 * | `{ index, self: tableau }` (objet) | `index := p.Sourced_index` ; `tableau := p.Sourced_self` |
 * | `{ key }` (`Record`) | `key := JSMapGet(p, "key")`, ouvert si TS connaît le type |
 * Refusés : valeur par défaut, `...reste`, motif imbriqué, clé calculée.
 */

function render(type: GoType) {
	return GoPrinter.renderNode(type);
}

async function elementGoType(name: TsAST.Identifier, context: BuildContext) {
	return tsTypeToGo(await context.transpilation.typeChecker.getTypeAtLocation(name), name, context);
}

export interface DestructureParams {
	readonly pattern: TsAST.BindingName;

	/** Expression Go de la valeur déstructurée, et son type Go. */
	readonly source: GoAST.Expression;
	readonly sourceType: GoType;

	/**
	 * Si fourni, les noms jamais lus sont ignorés (Go refuse une variable déclarée
	 * et inutilisée) ; sinon, chaque variable est marquée `_ = x`.
	 */
	readonly usedSymbols?: ReadonlySet<Symbol>;
}

interface ElementRead {
	readonly element: TsAST.BindingElement;
	readonly name: TsAST.Identifier;
	readonly position: number;
	readonly expected: GoType;
}

/** Expression Go qui lit un nom du motif sur la source. */
function readElement(params: DestructureParams & ElementRead, context: BuildContext) {
	const { pattern, source, element, name, position, expected } = params;
	const rendered = render(params.sourceType);
	const opens = render(expected) !== "any";

	if (TsAST.isArrayBindingPattern(pattern)) {
		const indexed = go.index(source, go.int(position));

		return DEither.success(rendered === "[]any" && opens ? go.assert(indexed, expected) : indexed);
	}

	const property = element.propertyName ?? name;

	if (!TsAST.isIdentifier(property) && !TsAST.isStringLiteral(property)) {
		return context.error(element, "binding-property-name-not-supported-yet");
	}

	if (rendered.startsWith("map[")) {
		const value = go.call(javascriptValue(context, "mapGet"), [source, go.string(property.text)]);

		return DEither.success(opens ? go.assert(value, expected) : value);
	}

	if (rendered.startsWith("struct")) {
		return DEither.success(GoAST.createSelectorExpression({
			target: source,
			identifier: context.createSourceIdentifier(property.text),
		}) as GoAST.Expression);
	}

	return context.error(pattern, "object-binding-source-not-supported-yet");
}

/** Lit chaque nom du motif sur la source : une variable Go par nom. */
export async function destructure(params: DestructureParams, context: BuildContext) {
	const { pattern, usedSymbols } = params;

	if (!TsAST.isArrayBindingPattern(pattern) && !TsAST.isObjectBindingPattern(pattern)) {
		return context.error(pattern, "binding-pattern-not-supported");
	}

	const statements: GoAST.Statement[] = [];

	for (const [position, element] of pattern.elements.entries()) {
		// `[, b]` : on saute simplement la position.
		if (TsAST.isOmittedExpression(element)) {
			continue;
		}

		const { name } = element;

		if (!name || !TsAST.isIdentifier(name) || element.dotDotDotToken || element.initializer) {
			return context.error(element, "binding-element-not-supported-yet");
		}

		const symbol = await context.transpilation.typeChecker.getSymbolAtLocation(name);

		if (usedSymbols && (!symbol || !usedSymbols.has(symbol))) {
			continue;
		}

		const targetType = await elementGoType(name, context);

		if (DEither.isLeft(targetType)) {
			return targetType;
		}

		const read = readElement({
			...params,
			element,
			name,
			position,
			expected: DEither.unwrapRight(targetType),
		}, context);

		if (DEither.isLeft(read)) {
			return read;
		}

		const variable = context.createSourceIdentifier(name.text);

		statements.push(go.declare(variable.value, DEither.unwrapRight(read)));

		if (!usedSymbols) {
			statements.push(go.assign([go.id("_")], [variable]));
		}
	}

	return DEither.success<readonly GoAST.Statement[]>(statements);
}
