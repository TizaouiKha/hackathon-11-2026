import * as DArray from "@duplojs/lang/array";
import * as DEither from "@duplojs/lang/either";
import { GoAST, GoPrinter } from "@go";
import type { TsAST } from "@typescript";
import { TypeFlags, type Type } from "typescript/async";
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
 * Phase 1 (décidée en équipe) : types primitifs et `Either`.
 * | TypeScript                                          | Go                  |
 * |-----------------------------------------------------|---------------------|
 * | `number`, littéral numérique, `number & Marque`     | `float64`           |
 * | `string`, littéral, template literal, `string & M`  | `string`            |
 * | `boolean`, `true`, `false`                          | `bool`              |
 * | `null` / `undefined`, `void`                        | `JSNull` / `JSUndefined` |
 * | union contenant un `Either` DuploJS                 | `EitherAny`         |
 * | union de valeurs brutes (`string \| number`), `any`, `unknown` | `any`    |
 * Tout le reste (tableaux, objets, fonctions…) : erreur `type-not-supported-yet`.
 */

export type GoType = GoAST.TypeReference | GoAST.Type;

const primitiveFlags = TypeFlags.NumberLike | TypeFlags.StringLike | TypeFlags.BooleanLike;

function has(type: Type, flags: TypeFlags) {
	return (type.flags & flags) !== 0;
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

export async function tsTypeToGo(
	type: Type,
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<BuildContext["error"]> | DEither.Right<"go-type", GoType>> {
	// Ordre important : `boolean` est aussi une union (`true | false`).
	if (has(type, TypeFlags.NumberLike)) {
		return DEither.right("go-type", GoAST.builtinTypeReferences.float64);
	}

	if (has(type, TypeFlags.StringLike)) {
		return DEither.right("go-type", GoAST.builtinTypeReferences.string);
	}

	if (has(type, TypeFlags.BooleanLike)) {
		return DEither.right("go-type", GoAST.builtinTypeReferences.bool);
	}

	if (has(type, TypeFlags.Null)) {
		return DEither.right("go-type", sharedType(context, nullShardDependency.value, "JSNull"));
	}

	if (has(type, TypeFlags.Undefined | TypeFlags.Void)) {
		return DEither.right("go-type", sharedType(context, undefinedShardDependency.value, "JSUndefined"));
	}

	if (has(type, TypeFlags.Any | TypeFlags.Unknown)) {
		return DEither.right("go-type", GoAST.builtinTypeReferences.any);
	}

	// Union contenant un Either (y compris un Either seul) -> EitherAny.
	const issues = await readEitherIssues(type, node, context);

	if (DEither.isLeft(issues) && !DEither.hasInformation(issues, "none")) {
		return issues;
	}

	if (DEither.isRight(issues)) {
		return DEither.right("go-type", sharedType(context, eitherCoreDependency.value, eitherAnyTypeIdentifier.value));
	}

	// Marque DuploJS (`number & Positive`) : on garde le seul membre primitif.
	if (type.isIntersectionType()) {
		const primitives = DArray.filter((await type.getTypes()) ?? [], (member) => has(member, primitiveFlags));
		const primitive = DArray.first(primitives);

		return primitive && primitives.length === 1
			? tsTypeToGo(primitive, node, context)
			: context.error(node, "type-not-supported-yet");
	}

	// Union de valeurs brutes : un seul type Go (`"a" | "b"` -> string), sinon `any`.
	if (type.isUnionType()) {
		const members = (await type.getTypes()) ?? [];
		const translated: GoType[] = [];

		for (const member of members) {
			const goType = await tsTypeToGo(member, node, context);

			if (DEither.isLeft(goType)) {
				return goType;
			}

			translated.push(DEither.unwrapRight(goType));
		}

		const kept = distinct(translated);
		const single = kept.length === 1 ? DArray.first(kept) : undefined;

		return DEither.right("go-type", single ?? GoAST.builtinTypeReferences.any);
	}

	return context.error(node, "type-not-supported-yet");
}

/** Type Go de l'expression ou de la déclaration `node`, d'après le checker. */
export async function tsTypeOfNodeToGo(node: TsAST.Node, context: BuildContext) {
	return tsTypeToGo(
		await context.transpilation.typeChecker.getTypeAtLocation(node),
		node,
		context,
	);
}
