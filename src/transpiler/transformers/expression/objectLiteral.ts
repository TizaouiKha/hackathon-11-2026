import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST, GoPrinter } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { tsTypeToGo } from "../type/tsTypeToGo";
import { expressionTransformers } from ".";

/**
 * Objet littéral (D-19) : `{ name, age: 3 }` devient un littéral du struct
 * anonyme que `tsTypeToGo` donne à son type, `struct{…}{Sourced_name: name, …}`.
 * Avec un type `Record<string, T>`, il devient un `map[string]T{"a": …}`.
 *
 * Le type attendu par le contexte (paramètre, retour déclaré) est préféré au
 * type propre du littéral : Go ne considère deux structs identiques que si leurs
 * champs sont dans le **même ordre**, et c'est le type déclaré qui fait foi.
 * Non traduits : décomposition `...objet`, clé calculée, méthode.
 */

function propertyName(name: TsAST.PropertyName) {
	if (TsAST.isIdentifier(name) || TsAST.isStringLiteral(name)) {
		return name.text;
	}

	return undefined;
}

export const objectLiteralTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		if (!TsAST.isObjectLiteralExpression(node)) {
			return context.notSupport();
		}

		const { typeChecker } = context.transpilation;
		const contextual = await typeChecker.getContextualType(node);
		const contextualGo = contextual && await tsTypeToGo(contextual, node, context);
		const useContextual = contextualGo !== undefined
			&& DEither.isRight(contextualGo)
			&& /^(struct|map\[)/.test(GoPrinter.renderNode(DEither.unwrapRight(contextualGo)));
		const goType = useContextual
			? contextualGo
			: await tsTypeToGo(await typeChecker.getTypeAtLocation(node), node, context);

		if (DEither.isLeft(goType)) {
			return goType;
		}

		const literalType = DEither.unwrapRight(goType);
		const isMap = GoPrinter.renderNode(literalType).startsWith("map[");

		if (!isMap && !GoPrinter.renderNode(literalType).startsWith("struct")) {
			return context.error(node, "object-literal-type-not-supported-yet");
		}

		const before: GoAST.Statement[] = [];
		const elements: GoAST.KeyedElement[] = [];

		for (const property of node.properties) {
			if (!TsAST.isPropertyAssignment(property) && !TsAST.isShorthandPropertyAssignment(property)) {
				return context.error(property, "object-literal-property-not-supported-yet");
			}

			const name = propertyName(property.name);

			if (name === undefined) {
				return context.error(property, "object-literal-property-not-supported-yet");
			}

			const valueNode = TsAST.isPropertyAssignment(property) ? property.initializer : property.name;
			const value = await DCommon.asyncPipe(
				context.transform(valueNode, expressionTransformers.value),
				DEither.unwrapRight,
			);

			if (DEither.isLeft(value)) {
				return value;
			}

			before.push(...value.before);
			elements.push(GoAST.createKeyedElement({
				key: isMap ? GoAST.createStringLiteral({ value: name }) : context.createSourceIdentifier(name),
				value: value.result,
			}));
		}

		return context.success({
			before,
			result: isMap
				? GoAST.createMapLiteral({
					typeReference: literalType as GoAST.MapType,
					elements,
				})
				: GoAST.createStructLiteral({
					typeReference: literalType as GoAST.StructType,
					elements: elements as readonly GoAST.KeyedElement<GoAST.Identifier>[],
				}),
		});
	},
);
