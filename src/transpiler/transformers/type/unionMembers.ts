import * as DEither from "@duplojs/lang/either";
import { GoPrinter } from "@go";
import { sharedDependencyPackageName } from "@transformer";
import type { TsAST } from "@typescript";
import { TypeFlags, type Type } from "typescript/async";
import type { BuildContext } from "../../context/build";
import { tsTypeToGo, type GoType } from "./tsTypeToGo";

/**
 * Unions de types connus (D-27).
 *
 * Une union de types Go différents (`string | "admin" | User`) est un `any` en
 * Go : c'est la seule façon de ranger « un string **ou** un User » au même
 * endroit. Sans `any` côté Duplo, chaque membre est connu à la compilation, d'où
 * la règle :
 *
 * > toute valeur qui entre dans une union est rangée sous le type Go **exact**
 * > de son membre.
 *
 * Ressortir la valeur devient alors une simple assertion (`value.(User)`), et
 * le transpileur connaît la liste des types Go possibles dans la boîte (un
 * `switch` sur le type suffit pour lire un champ commun). Aucune réflexion.
 */

export interface UnionMember {

	/** Les types TS qui donnent ce type Go (`string` et `"admin"` -> `string`). */
	readonly types: readonly Type[];
	readonly goType: GoType;
	readonly rendered: string;
}

function silent(context: BuildContext): BuildContext {
	return {
		...context,
		registerSharedDependency: () => sharedDependencyPackageName,
	};
}

/**
 * Les membres d'une union traduite en `any`, un par type Go distinct
 * (`string | "admin"` ne donne qu'un `string`). `undefined` : ce n'est pas une
 * telle union, ou un membre est inconnu (`any`, `unknown`, générique).
 */
export async function knownUnionMembers(
	type: Type | undefined,
	node: TsAST.Node,
	context: BuildContext,
): Promise<readonly UnionMember[] | undefined> {
	if (!type?.isUnionType()) {
		return undefined;
	}

	const whole = await tsTypeToGo(type, node, silent(context));

	if (DEither.isLeft(whole) || GoPrinter.renderNode(DEither.unwrapRight(whole)) !== "any") {
		return undefined;
	}

	const members: {
		types: Type[];
		goType: GoType;
		rendered: string;
	}[] = [];

	for (const member of (await type.getTypes()) ?? []) {
		if ((member.flags & (TypeFlags.Any | TypeFlags.Unknown | TypeFlags.Instantiable)) !== 0) {
			return undefined;
		}

		const goType = await tsTypeToGo(member, node, silent(context));

		if (DEither.isLeft(goType)) {
			return undefined;
		}

		const rendered = GoPrinter.renderNode(DEither.unwrapRight(goType));

		if (rendered === "any") {
			return undefined;
		}

		const known = members.find((candidate) => candidate.rendered === rendered);

		if (known) {
			known.types.push(member);
		} else {
			members.push({
				types: [member],
				goType: DEither.unwrapRight(goType),
				rendered,
			});
		}
	}

	return members.length > 1 ? members : undefined;
}

/** Le membre auquel une valeur de type `valueType` appartient (le premier qui l'accepte). */
export async function memberFor(
	valueType: Type,
	members: readonly UnionMember[],
	context: BuildContext,
): Promise<UnionMember | undefined> {
	for (const member of members) {
		for (const type of member.types) {
			if (await context.transpilation.typeChecker.isTypeAssignableTo(valueType, type)) {
				return member;
			}
		}
	}

	return undefined;
}
