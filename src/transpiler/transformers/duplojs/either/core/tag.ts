import * as DCommon from "@duplojs/lang/common";
import * as DString from "@duplojs/lang/string";
import { GoAST } from "@go";
import { createSharedDependency, type SharedDependency } from "@transformer";
import type { BuildContext } from "../../../../context/build";
import type { TranspilationContext } from "../../../../context/transpilation";
import {
	eitherCoreDependency,
	eitherTagInformationTableIdentifier,
	eitherTagIsRightTableIdentifier,
	eitherTagTypeIdentifier,
} from "./sharedDependency";

export type EitherSide = "right" | "left";

interface RegisteredTag {
	readonly identifier: GoAST.Identifier;
	readonly dependency: SharedDependency;
}

// Les tags sont numérotés par transpilation : l'état est rattaché au contexte
// global sans l'étendre avec un champ propre au domaine Either.
const tagRegistries = new WeakMap<TranspilationContext, Map<string, RegisteredTag>>();

function getRegistry(transpilation: TranspilationContext) {
	const existing = tagRegistries.get(transpilation);

	if (existing) {
		return existing;
	}

	const registry = new Map<string, RegisteredTag>();
	tagRegistries.set(transpilation, registry);

	return registry;
}

function createTagName(
	side: EitherSide,
	information: string,
	registry: Map<string, RegisteredTag>,
) {
	const words = DCommon.pipe(
		information,
		DString.split(/[^a-zA-Z0-9]+/),
	);
	const pascal = words
		.filter((word) => word !== "")
		.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
		.join("");
	const base = `Tag${side === "right" ? "Right" : "Left"}${pascal}`;
	const used = new Set([...registry.values()].map((tag) => tag.identifier.value));

	return used.has(base) ? `${base}${registry.size}` : base;
}

function createTag(
	identifier: GoAST.Identifier,
	index: number,
	side: EitherSide,
	information: string,
) {
	const isRightAssignment = side === "right"
		? [
			GoAST.createAssignmentStatement({
				targets: DCommon.cast([
					GoAST.createIndexExpression({
						target: eitherTagIsRightTableIdentifier,
						index: identifier,
					}),
				]),
				values: DCommon.cast([GoAST.createBooleanLiteral({ value: true })]),
			}),
		]
		: [];

	return createSharedDependency({
		imports: [],
		declarations: [
			GoAST.createConstantDeclaration({
				identifier,
				typeReference: eitherTagTypeIdentifier,
				initializer: GoAST.createIntegerLiteral({ value: BigInt(index) }),
			}),
		],
		init: [
			...isRightAssignment,
			GoAST.createAssignmentStatement({
				targets: DCommon.cast([
					GoAST.createIndexExpression({
						target: eitherTagInformationTableIdentifier,
						index: identifier,
					}),
				]),
				values: DCommon.cast([GoAST.createStringLiteral({ value: information })]),
			}),
		],
	});
}

/**
 * Retourne la constante Go (`shard_dependencies.TagLeftNegativeOperand`)
 * associée à une information DuploJS, en la créant au premier usage.
 * Enregistre aussi le cœur Either dans les dépendances partagées.
 */
export function registerEitherTag(
	context: BuildContext,
	side: EitherSide,
	information: string,
) {
	const registry = getRegistry(context.transpilation);
	const key = `${side}:${information}`;
	const packageName = context.registerSharedDependency(eitherCoreDependency.value);

	const tag = registry.get(key) ?? DCommon.justExec(() => {
		const identifier = GoAST.createIdentifier(createTagName(side, information, registry));
		const created: RegisteredTag = {
			identifier,
			dependency: createTag(identifier, registry.size, side, information),
		};

		registry.set(key, created);

		return created;
	});

	context.registerSharedDependency(tag.dependency);

	return GoAST.createSelectorExpression({
		target: packageName,
		identifier: tag.identifier,
	});
}
