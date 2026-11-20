import * as DArray from "@duplojs/lang/array";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST, GoPrinter } from "@go";
import { sharedDependencyPackageName } from "@transformer";
import type { TsAST } from "@typescript";
import type { Type } from "typescript/async";
import type { BuildContext } from "../../context/build";
import { undefinedShardDependency } from "../../sharedDependency/defaults";
import { go } from "../shared/goBuilder";
import { tsTypeToGo, type GoType } from "../type/tsTypeToGo";

/**
 * L'objet temporaire (D-21).
 *
 * TypeScript compare les objets **par leur forme** : un `User` complet convient
 * là où `{ name: string }` est attendu. Go compare des **types exacts** : ce sont
 * deux structs différents. On construit donc, à la compilation, un struct du
 * type attendu, rempli champ par champ par nom sur la source :
 * ```go
 * Sourced_test(struct{ Sourced_name string }{Sourced_name: Sourced_user.Sourced_name})
 * ```
 * - objets imbriqués : même règle, récursivement ;
 * - tableau d'objets (`User[]` vers `{ name: string }[]`) : une nouvelle slice ;
 * - champ facultatif attendu (`any`) absent de la source : `undefined` ;
 * - source qui n'est pas un simple nom (`getUser()`) : passée en paramètre d'une
 *   fonction littérale, pour n'être évaluée qu'une fois.
 * Aucune réflexion, aucune erreur possible à l'exécution : TypeScript a déjà
 * vérifié que chaque champ existe.
 * Garde-fou : on ne convertit que vers un struct ou un tableau de structs précis.
 * Un paramètre générique (traduit en `any` ou `[]any`) reçoit la valeur telle quelle.
 */

/** Rendu Go d'un type, sans enregistrer de dépendance (simple comparaison). */
async function render(type: Type, node: TsAST.Node, context: BuildContext) {
	const goType = await tsTypeToGo(type, node, {
		...context,
		goTypeCache: context.goTypeProbeCache,
		registerSharedDependency: () => sharedDependencyPackageName,
	});

	return DEither.isRight(goType) ? GoPrinter.renderNode(DEither.unwrapRight(goType)) : undefined;
}

async function goTypeOf(type: Type, node: TsAST.Node, context: BuildContext) {
	const goType = await tsTypeToGo(type, node, context);

	return DEither.isRight(goType) ? DEither.unwrapRight(goType) : undefined;
}

/** Un nom, ou un champ d'un nom (`user`, `team.leader`) : se relire ne coûte rien. */
function isSimple(expression: GoAST.Expression): boolean {
	if (DModeling.hasTagValue(expression, "[node]identifier")) {
		return true;
	}

	return DModeling.hasTagValue(expression, "[node][expression]selector")
		&& isSimple((expression as GoAST.SelectorExpression).target as GoAST.Expression);
}

/** `func(source S) T { return <corps> }(valeur)` : la valeur n'est évaluée qu'une fois. */
function evaluateOnce(value: GoAST.Expression, sourceType: GoType, targetType: GoType, body: GoAST.Expression) {
	return go.call(
		GoAST.createFunctionLiteral({
			arguments: [go.parameter("source", sourceType)],
			returnTypes: [targetType],
			body: go.block([go.return(body)]),
		}),
		[value],
	);
}

function undefinedValue(context: BuildContext) {
	return GoAST.createStructLiteral({
		typeReference: GoAST.createPackageTypeReference({
			packageName: context.registerSharedDependency(undefinedShardDependency.value),
			identifier: go.id("JSUndefined"),
		}),
		elements: [],
	});
}

/** Ce qu'on convertit : l'expression Go, son type TS, et le type TS attendu. */
export interface Conversion {
	readonly value: GoAST.Expression;
	readonly source: Type;
	readonly target: Type;
}

async function arrayElementType(type: Type, context: BuildContext) {
	const { typeChecker } = context.transpilation;

	return type.isTypeReference() && await typeChecker.isArrayType(type)
		? DArray.first(await typeChecker.getTypeArguments(type))
		: undefined;
}

async function convertStruct(
	{ value, source, target }: Conversion,
	node: TsAST.Node,
	context: BuildContext,
): Promise<GoAST.Expression | undefined> {
	const { typeChecker } = context.transpilation;
	const targetGo = await goTypeOf(target, node, context);
	const sourceGo = await goTypeOf(source, node, context);

	if (!targetGo || !sourceGo) {
		return undefined;
	}

	const simple = isSimple(value);
	const reader = simple ? value : go.id("source");
	const elements: GoAST.KeyedElement<GoAST.Identifier>[] = [];

	for (const property of await typeChecker.getPropertiesOfType(target)) {
		const field = context.createSourceIdentifier(property.name);
		const targetField = await typeChecker.getTypeOfSymbol(property);
		const sourceField = await typeChecker.getTypeOfPropertyOfType(source, property.name);

		if (!sourceField) {
			// Champ facultatif que la source n'a pas : `undefined`, comme JS.
			if (await render(targetField, node, context) !== "any") {
				return undefined;
			}

			elements.push(GoAST.createKeyedElement({
				key: field,
				value: undefinedValue(context),
			}));
			continue;
		}

		const read = go.select(reader, field.value);
		const converted = await convertStructurally({
			value: read,
			source: sourceField,
			target: targetField,
		}, node, context);

		elements.push(GoAST.createKeyedElement({
			key: field,
			value: converted ?? read,
		}));
	}

	const literal = GoAST.createStructLiteral({
		typeReference: targetGo as GoAST.StructType,
		elements,
	});

	return simple ? literal : evaluateOnce(value, sourceGo, targetGo, literal);
}

/**
 * ```go
 * func(source []S) []T {
 *     result := make([]T, len(source))
 *     for index, element := range source { result[index] = <element converti> }
 *     return result
 * }(valeur)
 * ```
 */
async function convertSlice(
	{ value, source, target }: Conversion,
	node: TsAST.Node,
	context: BuildContext,
): Promise<GoAST.Expression | undefined> {
	const sourceElement = await arrayElementType(source, context);
	const targetElement = await arrayElementType(target, context);
	const sourceGo = await goTypeOf(source, node, context);
	const targetGo = await goTypeOf(target, node, context);

	if (!sourceElement || !targetElement || !sourceGo || !targetGo) {
		return undefined;
	}

	const converted = await convertStructurally({
		value: go.id("element"),
		source: sourceElement,
		target: targetElement,
	}, node, context);

	if (!converted) {
		return undefined;
	}

	return go.call(
		GoAST.createFunctionLiteral({
			arguments: [go.parameter("source", sourceGo)],
			returnTypes: [targetGo],
			body: go.block([
				go.declare("result", GoAST.createCallExpression({
					callee: go.id("make"),
					typeArgument: targetGo as GoAST.SliceType,
					arguments: [go.call("len", [go.id("source")])],
				})),
				GoAST.createRangeStatement({
					binding: GoAST.createRangeDeclaration({
						key: go.id("index"),
						value: go.id("element"),
					}),
					expression: go.id("source"),
					body: go.block([go.assign([go.index(go.id("result"), go.id("index"))], [converted])]),
				}),
				go.return(go.id("result")),
			]),
		}),
		[value],
	);
}

/**
 * Convertit `value` (type TS `source`) vers le type TS `target` quand Go les
 * voit comme deux types différents. `undefined` : rien à faire, ou cas non traité.
 */
export async function convertStructurally(
	{ value, source, target }: Conversion,
	node: TsAST.Node,
	context: BuildContext,
): Promise<GoAST.Expression | undefined> {
	const sourceRendered = await render(source, node, context);
	const targetRendered = await render(target, node, context);

	if (!sourceRendered || !targetRendered || sourceRendered === targetRendered) {
		return undefined;
	}

	if (targetRendered.startsWith("struct") && sourceRendered.startsWith("struct")) {
		return convertStruct({
			value,
			source,
			target,
		}, node, context);
	}

	if (targetRendered.startsWith("[]struct") && sourceRendered.startsWith("[]struct")) {
		return convertSlice({
			value,
			source,
			target,
		}, node, context);
	}

	return undefined;
}
