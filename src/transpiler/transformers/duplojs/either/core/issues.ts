import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DGenerator from "@duplojs/lang/generator";
import type { TsAST } from "@typescript";
import type { Type } from "typescript/async";
import type { BuildContext } from "../../../../context/build";
import { valueInformation, type EitherSide } from "./tag";

/**
 * Une **issue** d'un Either DuploJS (D-18) : un côté, une information et le type
 * TS de sa valeur. C'est l'unité de DuploJS (« une erreur doit être identifiable »),
 * pas le côté : une union peut avoir autant d'issues que nécessaire.
 */
export interface EitherIssue {
	readonly side: EitherSide;
	readonly information: string;

	/** `undefined` quand l'issue ne porte pas de valeur (`Fail`, `Left<"x">`). */
	readonly valueType: Type | undefined;
}

/** Exports de types DuploJS reconnus comme issues Either. */
const eitherTypeNames: readonly string[] = ["Success", "Fail", "Error", "Left", "Right"];

function readInformation(type: Type | undefined, node: TsAST.Node, context: BuildContext) {
	if (type?.isStringLiteralType()) {
		return DEither.success(type.value);
	}

	return context.error(node, "either-information-must-be-a-string-literal");
}

/**
 * Lit un membre d'union. Retourne `none` si ce n'est pas un type Either de DuploJS
 * (le symbole doit venir de `@duplojs/lang`, pas seulement porter le bon nom).
 */
async function readEitherMember(type: Type, node: TsAST.Node, context: BuildContext) {
	const symbol = await type.getSymbol();

	if (!symbol || !DArray.includes(eitherTypeNames, symbol.name)) {
		return DEither.none();
	}

	const moduleReference = await DCommon.asyncPipe(
		context.resolveReferenceModule(symbol, "@duplojs/lang", /^dist\/either\//),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(moduleReference)) {
		return DEither.none();
	}

	const typeArguments = type.isTypeReference()
		? await context.transpilation.typeChecker.getTypeArguments(type)
		: [];

	if (symbol.name === "Success") {
		return DEither.some<EitherIssue>({
			side: "right",
			information: "success",
			valueType: DArray.first(typeArguments),
		});
	}

	if (symbol.name === "Fail") {
		return DEither.some<EitherIssue>({
			side: "left",
			information: "fail",
			valueType: undefined,
		});
	}

	if (symbol.name === "Error") {
		return DEither.some<EitherIssue>({
			side: "left",
			information: "error",
			valueType: DArray.first(typeArguments),
		});
	}

	const information = await DCommon.asyncPipe(
		readInformation(DArray.first(typeArguments), node, context),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(information)) {
		return information;
	}

	return DEither.some<EitherIssue>({
		side: symbol.name === "Left" ? "left" : "right",
		information,
		valueType: DArray.at(typeArguments, 1),
	});
}

async function unionMembers(type: Type) {
	return type.isUnionType()
		? (await type.getTypes()) ?? []
		: [type];
}

/**
 * Lit toutes les issues d'un type. Un membre qui n'est pas un Either devient une
 * **valeur brute** (issue `value`, tag `TagValue`, D-16), par exemple le `string`
 * de `string | Fail` produit par `unwrapRight`.
 * Retourne `none` si le type ne contient **aucun** Either : il n'est pas du domaine.
 */
export async function readEitherIssues(type: Type, node: TsAST.Node, context: BuildContext) {
	const members = await unionMembers(type);

	const read = await DCommon.asyncPipe(
		members,
		DGenerator.asyncReduce(
			DGenerator.reduceFrom<{
				issues: readonly EitherIssue[];
				hasEither: boolean;
			}>({
				issues: [],
				hasEither: false,
			}),
			async({ item, lastValue, next, exit }) => {
				const issue = await readEitherMember(item, node, context);

				if (DEither.isRight(issue)) {
					return next({
						issues: DArray.push(lastValue.issues, DEither.unwrapRight(issue)),
						hasEither: true,
					});
				}

				if (!DEither.hasInformation(issue, "none")) {
					return exit(issue);
				}

				return next({
					issues: DArray.push(lastValue.issues, {
						side: "value" as const,
						information: valueInformation,
						valueType: item,
					}),
					hasEither: lastValue.hasEither,
				});
			},
		),
	);

	if (DEither.isLeft(read)) {
		return read;
	}

	return read.hasEither
		? DEither.some(read.issues)
		: DEither.none();
}
