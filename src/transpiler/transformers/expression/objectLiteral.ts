import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST, GoPrinter } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { tsTypeToGo } from "../type/tsTypeToGo";
import { knownUnionMembers, memberFor } from "../type/unionMembers";
import { undefinedShardDependency } from "../../sharedDependency/defaults";
import { expressionTransformers } from ".";
import { sequenceOperands, type SequencedOperand } from "../shared/sequence";

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
		// Dans un tableau (`[{ name, age }, { age, name }]`), TS ne garde qu'un type
		// d'élément, alors que Go distingue l'ordre des champs : chaque objet prend le
		// type d'élément du tableau, et ses champs sont remplis par nom (D-20).
		const arrayElementType = !useContextual && TsAST.isArrayLiteralExpression(node.parent)
			? await typeChecker.getTypeAtLocation(node.parent).then(async(arrayType) => (
				arrayType.isTypeReference() && await typeChecker.isArrayType(arrayType)
					? DArray.first(await typeChecker.getTypeArguments(arrayType))
					: undefined
			))
			: undefined;
		// Attendu : une union de types connus (`Value[]`, `area({ kind: "circle", … })`).
		// Le littéral prend le type Go exact du membre auquel il correspond (D-27).
		const unionMember = useContextual
			? undefined
			: await DCommon.asyncPipe(
				knownUnionMembers(contextual ?? arrayElementType, node, context),
				async(members) => members && memberFor(await typeChecker.getTypeAtLocation(node), members, context),
			);
		const memberGo = unionMember && /^(struct|map\[)/.test(unionMember.rendered)
			? DEither.right("go-type", unionMember.goType)
			: undefined;
		const ownType = arrayElementType ?? await typeChecker.getTypeAtLocation(node);
		const goType = useContextual
			? contextualGo
			: memberGo ?? await tsTypeToGo(ownType, node, context);

		if (DEither.isLeft(goType)) {
			return goType;
		}

		const literalType = DEither.unwrapRight(goType);
		const isMap = GoPrinter.renderNode(literalType).startsWith("map[");

		if (!isMap && !GoPrinter.renderNode(literalType).startsWith("struct")) {
			return context.error(node, "object-literal-type-not-supported-yet");
		}

		const keys: GoAST.Expression[] = [];
		const values: SequencedOperand[] = [];

		for (const property of node.properties) {
			if (!TsAST.isPropertyAssignment(property) && !TsAST.isShorthandPropertyAssignment(property)) {
				return context.error(property, "object-literal-property-not-supported-yet");
			}

			const name = propertyName(property.name);

			if (name === undefined) {
				return context.error(property, "object-literal-property-not-supported-yet");
			}

			const valueNode = TsAST.isPropertyAssignment(property) ? property.initializer : property.name;
			// Préparée comme un argument d'appel : Go ne garantit pas quand une variable
			// est lue par rapport à un appel voisin (`{ a: x, b: change() }`).
			const value = await context.transformPrepared(valueNode, expressionTransformers.value);

			if (DEither.isLeft(value)) {
				return value;
			}

			keys.push(isMap ? GoAST.createStringLiteral({ value: name }) : context.createSourceIdentifier(name));
			values.push({
				node: valueNode,
				...value,
			});
		}

		// Les valeurs dans l'ordre de JavaScript (R-01, n° 2).
		const { before, operands } = await sequenceOperands(values, context);
		const elements = operands.map((value, index) => GoAST.createKeyedElement({
			key: keys[index]!,
			value,
		}));

		// Champ facultatif absent (`{ name }` pour `{ name; nickname? }`) : `undefined`
		// comme en JS, et non le `nil` que Go mettrait par défaut.
		if (!isMap) {
			const given = new Set(keys.map((key) => GoPrinter.renderNode(key)));

			for (const field of (literalType as GoAST.StructType).fields) {
				if (
					DModeling.hasTagValue(field, "[node]struct-field")
					&& !given.has(field.identifier.value)
					&& GoPrinter.renderNode(field.typeReference) === "any"
				) {
					elements.push(GoAST.createKeyedElement({
						key: field.identifier,
						value: GoAST.createStructLiteral({
							typeReference: GoAST.createPackageTypeReference({
								packageName: context.registerSharedDependency(undefinedShardDependency.value),
								identifier: GoAST.createIdentifier("JSUndefined"),
							}),
							elements: [],
						}),
					}));
				}
			}
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
