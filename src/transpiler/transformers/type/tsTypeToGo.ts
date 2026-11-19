import * as DArray from "@duplojs/lang/array";
import * as DEither from "@duplojs/lang/either";
import { GoAST, GoPrinter } from "@go";
import { sharedDependencyPackageName } from "@transformer";
import type { TsAST } from "@typescript";
import { TypeFlags, type IndexInfo, type Signature, type Symbol as TsSymbol, type Type } from "typescript/async";
import type { BuildContext } from "../../context/build";
import { nullShardDependency, undefinedShardDependency } from "../../sharedDependency/defaults";
import { readEitherIssues } from "../duplojs/either/core/issues";
import { eitherAnyTypeIdentifier, eitherCoreDependency } from "../duplojs/either/core/sharedDependency";

/**
 * Couche de traduction des types TypeScript vers Go (D-18).
 *
 * Un **seul** endroit traduit un type du checker (objet `Type`, déjà résolu :
 * narrowing, `Extract`, `ReturnType`… sont calculés par TypeScript) en type Go.
 *
 * Phase 1 : types primitifs et `Either`.
 * | TypeScript                                          | Go                  |
 * |-----------------------------------------------------|---------------------|
 * | `number`, littéral numérique, `number & Marque`     | `float64`           |
 * | `string`, littéral, template literal, `string & M`  | `string`            |
 * | `boolean`, `true`, `false`                          | `bool`              |
 * | `null` / `undefined`, `void`                        | `JSNull` / `JSUndefined` |
 * | union contenant un `Either` DuploJS                 | `EitherAny`         |
 * | union de valeurs brutes (`string \| number`), `any`, `unknown` | `any`    |
 *
 * Phase 3 :
 * | TypeScript                               | Go                                          |
 * |------------------------------------------|---------------------------------------------|
 * | `T[]`, `readonly T[]`                    | `[]T`                                       |
 * | tuple `[A, A]` / `[A, B]`                | `[]A` / `[]any` (une slice, comme un tableau JS) |
 * | objet `{ name: string }`                 | struct anonyme `struct{ Sourced_name string }` |
 * | `Record<string, T>`, `{ [k: string]: T }` | `map[string]T` (`map[float64]T` si la clé est un number) |
 * | fonction `(a: A, ...r: B[]) => R`        | `func(A, ...B) R` (`void` : pas de retour)  |
 * | `Promise<T>`                             | `T` (D-11, exécution synchrone)             |
 * | type non résolu (`T`, conditionnel)      | sa contrainte (`T extends string` : `string`), sinon `any` |
 * Un type récursif (`interface Node { next: Node }`) : `recursive-type-not-supported-yet`.
 */

export type GoType = GoAST.TypeReference | GoAST.Type;

type GoTypeResult = Promise<ReturnType<BuildContext["error"]> | DEither.Right<"go-type", GoType>>;

const primitiveFlags = TypeFlags.NumberLike | TypeFlags.StringLike | TypeFlags.BooleanLike;

function has(type: Type, flags: TypeFlags) {
	return (type.flags & flags) !== 0;
}

/**
 * Tag `json:"<nom TS>"` d'un champ de struct. Il fait partie du type Go : deux
 * structs anonymes ne sont identiques que si leurs tags le sont aussi.
 */
export function jsonTag(name: string) {
	return `json:"${name}"`;
}

function goType(value: GoType) {
	return DEither.right("go-type", value);
}

function sharedType(context: BuildContext, dependency: Parameters<BuildContext["registerSharedDependency"]>[0], name: string) {
	return GoAST.createPackageTypeReference({
		packageName: context.registerSharedDependency(dependency),
		identifier: GoAST.createIdentifier(name),
	});
}

/** Un même type Go (rendu identique) n'est compté qu'une fois. */
function distinct(types: readonly GoType[]) {
	return DArray.reduce(
		types,
		DArray.reduceFrom<readonly GoType[]>([]),
		({ element, lastValue, next }) => (
			DArray.some(lastValue, (kept) => GoPrinter.renderNode(kept) === GoPrinter.renderNode(element))
				? next(lastValue)
				: next(DArray.push(lastValue, element))
		),
	);
}

export function tsTypeToGo(type: Type, node: TsAST.Node, context: BuildContext): GoTypeResult {
	return translate(type, node, context, new Set());
}

/** Type Go de l'expression ou de la déclaration `node`, d'après le checker. */
export async function tsTypeOfNodeToGo(node: TsAST.Node, context: BuildContext) {
	return tsTypeToGo(
		await context.transpilation.typeChecker.getTypeAtLocation(node),
		node,
		context,
	);
}

/** `inProgress` : objets en cours de traduction, pour détecter les types récursifs. */
async function translate(
	type: Type,
	node: TsAST.Node,
	context: BuildContext,
	inProgress: ReadonlySet<number>,
): GoTypeResult {
	// Ordre important : `boolean` est aussi une union (`true | false`).
	if (has(type, TypeFlags.NumberLike)) {
		return goType(GoAST.builtinTypeReferences.float64);
	}

	if (has(type, TypeFlags.StringLike)) {
		return goType(GoAST.builtinTypeReferences.string);
	}

	if (has(type, TypeFlags.BooleanLike)) {
		return goType(GoAST.builtinTypeReferences.bool);
	}

	if (has(type, TypeFlags.Null)) {
		return goType(sharedType(context, nullShardDependency.value, "JSNull"));
	}

	if (has(type, TypeFlags.Undefined | TypeFlags.Void)) {
		return goType(sharedType(context, undefinedShardDependency.value, "JSUndefined"));
	}

	if (has(type, TypeFlags.Any | TypeFlags.Unknown)) {
		return goType(GoAST.builtinTypeReferences.any);
	}

	// Type non résolu (`T`, `T extends X ? A : B`…) : sa contrainte, calculée par
	// TypeScript (`S extends string` -> `string`). Sans contrainte, ou si elle
	// n'est pas traduisible (`T extends AnyValue`, l'union de toutes les valeurs) : `any`.
	if (has(type, TypeFlags.Instantiable)) {
		const constraint = await context.transpilation.typeChecker.getBaseConstraintOfType(type);

		// Sondage sans enregistrer de dépendance : un échec à mi-chemin laisserait
		// un import Go inutilisé, qui ne compile pas.
		const probe = constraint && constraint.id !== type.id
			? await translate(constraint, node, {
				...context,
				registerSharedDependency: () => sharedDependencyPackageName,
			}, inProgress)
			: undefined;

		return constraint && probe && DEither.isRight(probe)
			? translate(constraint, node, context, inProgress)
			: goType(GoAST.builtinTypeReferences.any);
	}

	// Union contenant un Either (y compris un Either seul) -> EitherAny.
	const issues = await readEitherIssues(type, node, context);

	if (DEither.isLeft(issues) && !DEither.hasInformation(issues, "none")) {
		return issues;
	}

	if (DEither.isRight(issues)) {
		return goType(sharedType(context, eitherCoreDependency.value, eitherAnyTypeIdentifier.value));
	}

	// Marque DuploJS (`number & Positive`, `readonly string[] & MinElements<2>`) :
	// on garde le seul membre qui porte la valeur, primitif ou tableau.
	if (type.isIntersectionType()) {
		const { typeChecker } = context.transpilation;
		const carriers: Type[] = [];

		for (const member of (await type.getTypes()) ?? []) {
			if (
				has(member, primitiveFlags)
				|| await typeChecker.isArrayType(member)
				|| await typeChecker.isTupleType(member)
			) {
				carriers.push(member);
			}
		}

		const carrier = DArray.first(carriers);

		return carrier && carriers.length === 1
			? translate(carrier, node, context, inProgress)
			: context.error(node, "type-not-supported-yet");
	}

	// Union de valeurs brutes : un seul type Go (`"a" | "b"` -> string), sinon `any`.
	if (type.isUnionType()) {
		const translated = await translateAll((await type.getTypes()) ?? [], node, context, inProgress);

		if (DEither.isLeft(translated)) {
			return translated;
		}

		const kept = distinct(DEither.unwrapRight(translated));
		const single = kept.length === 1 ? DArray.first(kept) : undefined;

		return goType(single ?? GoAST.builtinTypeReferences.any);
	}

	if (has(type, TypeFlags.Object)) {
		if (inProgress.has(type.id)) {
			return context.error(node, "recursive-type-not-supported-yet");
		}

		return translateObject(type, node, context, new Set([...inProgress, type.id]));
	}

	return context.error(node, "type-not-supported-yet");
}

/** Traduit une liste de types ; s'arrête à la première erreur. */
async function translateAll(
	types: readonly Type[],
	node: TsAST.Node,
	context: BuildContext,
	inProgress: ReadonlySet<number>,
) {
	const translated: GoType[] = [];

	for (const member of types) {
		const translatedMember = await translate(member, node, context, inProgress);

		if (DEither.isLeft(translatedMember)) {
			return translatedMember;
		}

		translated.push(DEither.unwrapRight(translatedMember));
	}

	return DEither.success<readonly GoType[]>(translated);
}

async function typesOfSymbols(symbols: readonly TsSymbol[], context: BuildContext) {
	const { typeChecker } = context.transpilation;
	const types: Type[] = [];

	for (const symbol of symbols) {
		types.push(await typeChecker.getTypeOfSymbol(symbol));
	}

	return types;
}

async function translateTuple(
	type: Type,
	node: TsAST.Node,
	context: BuildContext,
	inProgress: ReadonlySet<number>,
): GoTypeResult {
	const elements = type.isTypeReference()
		? await context.transpilation.typeChecker.getTypeArguments(type)
		: [];
	const translated = await translateAll(elements, node, context, inProgress);

	if (DEither.isLeft(translated)) {
		return translated;
	}

	// Un tuple est un tableau JS : une slice Go (même sémantique de référence,
	// compatible avec `T[]` dans une union, utilisable par `DArray.map`).
	// Éléments de types Go différents : `[]any`, lus par assertion (TS connaît
	// le type de chaque position), comme `EitherAny` (D-18.5).
	const kept = distinct(DEither.unwrapRight(translated));
	const single = kept.length === 1 ? DArray.first(kept) : undefined;

	return goType(GoAST.createSliceType({ elementType: single ?? GoAST.builtinTypeReferences.any }));
}

/** Élément `B` du paramètre `...rest: B[]`, s'il y en a un. */
async function restElementType(signature: Signature, parameterTypes: readonly Type[], context: BuildContext) {
	const { typeChecker } = context.transpilation;
	const restType = signature.hasRestParameter ? DArray.last(parameterTypes) : undefined;

	if (!restType) {
		return DEither.none();
	}

	const element = await typeChecker.isArrayType(restType) && restType.isTypeReference()
		? DArray.first(await typeChecker.getTypeArguments(restType))
		: undefined;

	return element
		? DEither.some(element)
		: DEither.left("rest-parameter-must-be-an-array");
}

async function translateFunction(
	signature: Signature,
	node: TsAST.Node,
	context: BuildContext,
	inProgress: ReadonlySet<number>,
): GoTypeResult {
	const parameterTypes = await typesOfSymbols(await signature.getParameters(), context);
	const rest = await restElementType(signature, parameterTypes, context);

	if (DEither.hasInformation(rest, "rest-parameter-must-be-an-array")) {
		return context.error(node, "rest-parameter-must-be-an-array");
	}

	const restElement = DEither.isRight(rest) ? DEither.unwrapRight(rest) : undefined;
	const fixed = await translateAll(
		restElement ? parameterTypes.slice(0, -1) : parameterTypes,
		node,
		context,
		inProgress,
	);

	if (DEither.isLeft(fixed)) {
		return fixed;
	}

	const variadic = restElement && await translate(restElement, node, context, inProgress);

	if (variadic && DEither.isLeft(variadic)) {
		return variadic;
	}

	const returnType = await signature.getReturnType();
	const returned = has(returnType, TypeFlags.Void)
		? undefined
		: await translate(returnType, node, context, inProgress);

	if (returned && DEither.isLeft(returned)) {
		return returned;
	}

	return goType(GoAST.createFunctionType({
		arguments: DEither.unwrapRight(fixed).map((argumentType, index) => GoAST.createFunctionArgument({
			identifier: GoAST.createIdentifier(`p${index}`),
			type: argumentType,
		})),
		variadicArgument: variadic
			? GoAST.createFunctionArgument({
				identifier: GoAST.createIdentifier("rest"),
				type: DEither.unwrapRight(variadic),
			})
			: undefined,
		returnTypes: returned ? [DEither.unwrapRight(returned)] : [],
	}));
}

/** `map[K]V` pour un objet qui n'a qu'une signature d'index. */
async function translateIndex(
	index: IndexInfo,
	node: TsAST.Node,
	context: BuildContext,
	inProgress: ReadonlySet<number>,
): GoTypeResult {
	const keyType = has(index.keyType, TypeFlags.NumberLike)
		? GoAST.builtinTypeReferences.float64
		: GoAST.builtinTypeReferences.string;
	const valueType = await translate(index.valueType, node, context, inProgress);

	if (DEither.isLeft(valueType)) {
		return valueType;
	}

	return goType(GoAST.createMapType({
		keyType,
		valueType: DEither.unwrapRight(valueType),
	}));
}

async function translateArray(
	type: Type,
	node: TsAST.Node,
	context: BuildContext,
	inProgress: ReadonlySet<number>,
): GoTypeResult {
	const element = type.isTypeReference()
		? DArray.first(await context.transpilation.typeChecker.getTypeArguments(type))
		: undefined;

	if (!element) {
		return context.error(node, "array-without-element-type");
	}
	if (element.isUnionType()) {
		let hasCallable = false;
		let hasEither = false;

		for (const member of (await element.getTypes()) ?? []) {
			hasCallable ||= (await member.getCallSignatures()).length > 0;
			const memberIssues = await readEitherIssues(member, node, context);
			hasEither ||= DEither.isRight(memberIssues);
		}
		// `MayBeGetter<Either>[]` mélange deux représentations Go incompatibles.
		// La slice garde donc `any`; asyncGroup rétablit le type de chaque position.
		if (hasCallable && hasEither) {
			return goType(GoAST.createSliceType({ elementType: GoAST.builtinTypeReferences.any }));
		}
	}

	const elementType = await translate(element, node, context, inProgress);

	if (DEither.isLeft(elementType)) {
		return elementType;
	}

	return goType(GoAST.createSliceType({ elementType: DEither.unwrapRight(elementType) }));
}

async function translateStruct(
	type: Type,
	node: TsAST.Node,
	context: BuildContext,
	inProgress: ReadonlySet<number>,
): GoTypeResult {
	const properties = await context.transpilation.typeChecker.getPropertiesOfType(type);
	const fieldTypes = await translateAll(await typesOfSymbols(properties, context), node, context, inProgress);

	if (DEither.isLeft(fieldTypes)) {
		return fieldTypes;
	}

	const goFieldTypes = DEither.unwrapRight(fieldTypes);

	return goType(GoAST.createStructType({
		fields: properties.map((property, position) => GoAST.createStructField({
			identifier: context.createSourceIdentifier(property.name),
			typeReference: goFieldTypes[position] ?? GoAST.builtinTypeReferences.any,
			// Nom TS d'origine : `print` l'affiche (`{ name: 'ada' }`, pas `Sourced_name`).
			tag: jsonTag(property.name),
		})),
	}));
}

async function translateObject(
	type: Type,
	node: TsAST.Node,
	context: BuildContext,
	inProgress: ReadonlySet<number>,
): GoTypeResult {
	const { typeChecker } = context.transpilation;

	if (await typeChecker.isTupleType(type)) {
		return translateTuple(type, node, context, inProgress);
	}

	if (await typeChecker.isArrayType(type)) {
		return translateArray(type, node, context, inProgress);
	}

	// `Promise<T>` : exécution synchrone (D-11), on garde la valeur attendue.
	if ((await type.getSymbol())?.name === "Promise") {
		const awaited = await typeChecker.getAwaitedType(type);

		return awaited
			? translate(awaited, node, context, inProgress)
			: context.error(node, "promise-without-awaited-type");
	}

	const properties = await typeChecker.getPropertiesOfType(type);
	const signatures = await type.getCallSignatures();
	const [signature] = signatures;

	if (signature) {
		return properties.length === 0 && signatures.length === 1
			? translateFunction(signature, node, context, inProgress)
			: context.error(node, "overloaded-or-callable-object-not-supported-yet");
	}

	const indexInfos = await typeChecker.getIndexInfosOfType(type);
	const [index] = indexInfos;

	if (index) {
		return properties.length === 0 && indexInfos.length === 1
			? translateIndex(index, node, context, inProgress)
			: context.error(node, "object-with-properties-and-index-not-supported-yet");
	}

	return translateStruct(type, node, context, inProgress);
}
