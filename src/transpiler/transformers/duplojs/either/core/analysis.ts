import * as DArray from "@duplojs/lang/array";
import * as DEither from "@duplojs/lang/either";
import { GoAST, GoPrinter } from "@go";
import type { TsAST } from "@typescript";
import type { Type } from "typescript/async";
import type { BuildContext } from "../../../../context/build";
import { tsTypeToGo, type GoType } from "../../../type/tsTypeToGo";
import { readEitherIssues, type EitherIssue } from "./issues";
import { undefinedShardDependency } from "../../../../sharedDependency/defaults";
import { eitherAnyTypeIdentifier, eitherCoreDependency } from "./sharedDependency";

/** Une union d'Either vue comme la liste de ses issues (D-18). En Go : toujours `EitherAny`. */
export interface EitherShape {
	readonly issues: readonly EitherIssue[];
}

/** `shard_dependencies.EitherAny`, vu depuis un package source. */
export function eitherAnyGoType(context: BuildContext): GoType {
	return GoAST.createPackageTypeReference({
		packageName: context.registerSharedDependency(eitherCoreDependency.value),
		identifier: eitherAnyTypeIdentifier,
	});
}

/** Type TS -> type Go (couche centrale, D-18). */
export function transformTsType(type: Type, enclosing: TsAST.Node, context: BuildContext) {
	return tsTypeToGo(type, enclosing, context);
}

/** Type Go de l'expression `node`, d'après le checker. */
export async function transformTypeOfNode(node: TsAST.Node, context: BuildContext) {
	return tsTypeToGo(
		await context.transpilation.typeChecker.getTypeAtLocation(node),
		node,
		context,
	);
}

/** Lit les issues du type d'une expression ; erreur si ce n'est pas une union d'Either. */
export async function analyzeEitherOfNode(node: TsAST.Node, context: BuildContext) {
	return analyzeEitherOfType(
		await context.transpilation.typeChecker.getTypeAtLocation(node),
		node,
		context,
	);
}

/**
 * Lit les issues d'un type TS. `node` sert de contexte au checker et aux
 * messages d'erreur (utile quand le type ne vient pas d'une expression, par
 * exemple le paramètre d'une forme curryfiée).
 */
export async function analyzeEitherOfType(type: Type, node: TsAST.Node, context: BuildContext) {
	const issues = await readEitherIssues(type, node, context);

	if (DEither.isLeft(issues)) {
		return DEither.hasInformation(issues, "none")
			? context.error(node, "expected-either-value")
			: issues;
	}

	return DEither.success<EitherShape>({ issues: DEither.unwrapRight(issues) });
}

/** Type Go de la valeur d'une issue (`JSUndefined` si elle n'en porte pas). */
export async function issueValueGoType(issue: EitherIssue, node: TsAST.Node, context: BuildContext) {
	if (issue.valueType === undefined) {
		return DEither.right("go-type", GoAST.createPackageTypeReference({
			packageName: context.registerSharedDependency(undefinedShardDependency.value),
			identifier: GoAST.createIdentifier("JSUndefined"),
		}) as GoType);
	}

	return tsTypeToGo(issue.valueType, node, context);
}

/**
 * Type Go de la valeur lue sur un côté (`right` : ce que reçoit `onRight`).
 * Un seul type Go pour toutes les issues de ce côté -> ce type ; sinon `any`.
 */
export async function sideValueGoType(
	shape: EitherShape,
	side: EitherIssue["side"],
	node: TsAST.Node,
	context: BuildContext,
) {
	const issues = DArray.filter(shape.issues, (issue) => issue.side === side);
	const types: GoType[] = [];

	for (const issue of issues) {
		const goType = await issueValueGoType(issue, node, context);

		if (DEither.isLeft(goType)) {
			return goType;
		}

		const translated = DEither.unwrapRight(goType);

		if (!DArray.some(types, (kept) => GoPrinter.renderNode(kept) === GoPrinter.renderNode(translated))) {
			types.push(translated);
		}
	}

	const single = types.length === 1 ? DArray.first(types) : undefined;

	return DEither.right("go-type", single ?? (GoAST.builtinTypeReferences.any as GoType));
}
