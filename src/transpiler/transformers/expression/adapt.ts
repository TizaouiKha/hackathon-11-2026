import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST, GoPrinter } from "@go";
import { TsAST } from "@typescript";
import { createTransformer, sharedDependencyPackageName, type Transformer } from "@transformer";
import type { Type } from "typescript/async";
import type { BuildContext } from "../../context/build";
import { tsTypeToGo, type GoType } from "../type/tsTypeToGo";
import {
	eitherAnyTypeIdentifier,
	eitherCoreDependency,
	eitherFieldIdentifiers,
} from "../duplojs/either/core/sharedDependency";
import { registerEitherTag, valueInformation } from "../duplojs/either/core/tag";
import { asTyped, needsConversion } from "./javascriptObjects";
import { convertStructurally } from "./structuralConversion";

/**
 * Adaptation des expressions aux points de narrowing (D-18, phase 2).
 *
 * TypeScript connaît, pour chaque expression, trois types :
 * - **produit** : ce que le code Go de l'expression fabrique réellement. Pour un
 *   identifiant, c'est le type **déclaré** de la variable (`value: string | Fail`
 *   est un `EitherAny` en Go, même là où TS l'a rétréci) ; sinon le type au point.
 * - **rétréci** : le type au point (`getTypeAtLocation`), après `isLeft`, `||`…
 * - **attendu** : le type contextuel (paramètre appelé, type de retour…).
 *
 * La cible est le type attendu s'il est concret ou Either, sinon le type rétréci.
 * | produit     | cible         | Go                                         |
 * |-------------|---------------|--------------------------------------------|
 * | `EitherAny` | concret `T`   | `x.Value.(T)`                              |
 * | `EitherAny` | `any`         | `x.Value`                                  |
 * | `any`       | concret `T`   | `x.(T)`                                    |
 * | brut        | `EitherAny`   | `EitherAny{Tag: TagValue, Value: x}` (D-16) |
 * Dans tous les autres cas l'expression est gardée telle quelle, de même quand un
 * des types n'est pas encore traduisible (fonctions, génériques…).
 */

type GoTypeKind = "either" | "any" | "concrete";

interface ClassifiedType {
	readonly kind: GoTypeKind;
	readonly type: Type;
}

/**
 * Contexte de sondage : traduire un type ne doit pas ajouter d'import Go
 * (un import inutilisé ne compile pas). Les dépendances ne sont enregistrées
 * qu'au moment où l'adaptation est réellement produite.
 */
function silentContext(context: BuildContext): BuildContext {
	return {
		...context,
		registerSharedDependency: () => sharedDependencyPackageName,
	};
}

const renderedAny = GoPrinter.renderNode(GoAST.builtinTypeReferences.any);
const renderedEitherAny = GoPrinter.renderNode(GoAST.createPackageTypeReference({
	packageName: sharedDependencyPackageName,
	identifier: eitherAnyTypeIdentifier,
}));

async function classify(type: Type | undefined, node: TsAST.Node, context: BuildContext) {
	if (!type) {
		return undefined;
	}

	const goType = await tsTypeToGo(type, node, silentContext(context));

	if (DEither.isLeft(goType)) {
		return undefined;
	}

	const rendered = GoPrinter.renderNode(DEither.unwrapRight(goType));

	return {
		kind: DCommon.justExec((): GoTypeKind => {
			if (rendered === renderedEitherAny) {
				return "either";
			}

			return rendered === renderedAny ? "any" : "concrete";
		}),
		type,
	} satisfies ClassifiedType;
}

async function producedType(node: TsAST.Expression, context: BuildContext) {
	const { typeChecker } = context.transpilation;

	// Une variable ou un champ (`user.name`) a en Go le type de sa **déclaration**.
	if (TsAST.isIdentifier(node) || TsAST.isPropertyAccessExpression(node)) {
		const symbol = await typeChecker.getSymbolAtLocation(node);
		const declared = symbol && await classify(await typeChecker.getTypeOfSymbol(symbol), node, context);

		if (declared) {
			return declared;
		}
	}

	return classify(await typeChecker.getTypeAtLocation(node), node, context);
}

/**
 * `const { name } = user` : TypeScript donne comme type « attendu » la forme du
 * motif (`{ name: any }`). Ce n'est pas un vrai type cible : on l'ignore (D-21).
 */
function initializesBindingPattern(node: TsAST.Expression) {
	const { parent } = node;

	return TsAST.isVariableDeclaration(parent)
		&& parent.initializer === node
		&& !parent.type
		&& (TsAST.isObjectBindingPattern(parent.name) || TsAST.isArrayBindingPattern(parent.name));
}

async function targetType(node: TsAST.Expression, context: BuildContext) {
	const { typeChecker } = context.transpilation;
	const expected = initializesBindingPattern(node)
		? undefined
		: await classify(await typeChecker.getContextualType(node), node, context);

	if (expected && expected.kind !== "any") {
		return expected;
	}

	return classify(await typeChecker.getTypeAtLocation(node), node, context);
}

async function concreteGoType(type: Type, node: TsAST.Node, context: BuildContext) {
	return DCommon.asyncPipe(tsTypeToGo(type, node, context), DEither.unwrapRight);
}

function assertTo(value: GoAST.Expression, type: GoType) {
	return GoAST.createTypeAssertionExpression({
		target: value,
		typeReference: type,
	});
}

function eitherValue(expression: GoAST.Expression) {
	return GoAST.createSelectorExpression({
		target: expression,
		identifier: eitherFieldIdentifiers.value,
	});
}

/** Expression Go adaptée, ou `undefined` si l'expression est déjà du bon type. */
export async function adaptExpression(
	node: TsAST.Expression,
	expression: GoAST.Expression,
	context: BuildContext,
): Promise<GoAST.Expression | undefined> {
	const produced = await producedType(node, context);
	const target = produced && await targetType(node, context);

	// Deux objets de formes différentes (`User` passé à `{ name: string }`) :
	// l'objet temporaire, construit à la compilation (D-21).
	if (produced?.kind === "concrete" && target?.kind === "concrete") {
		return convertStructurally({
			value: expression,
			source: produced.type,
			target: target.type,
		}, node, context);
	}

	if (!produced || !target || produced.kind === target.kind) {
		return undefined;
	}

	if (produced.kind === "either") {
		if (target.kind === "any") {
			return eitherValue(expression);
		}

		const goType = await concreteGoType(target.type, node, context);

		return DEither.isLeft(goType)
			? undefined
			: assertTo(eitherValue(expression), goType);
	}

	if (target.kind === "either") {
		const packageName = context.registerSharedDependency(eitherCoreDependency.value);

		return GoAST.createStructLiteral({
			typeReference: GoAST.createPackageTypeReference({
				packageName,
				identifier: eitherAnyTypeIdentifier,
			}),
			elements: [
				GoAST.createKeyedElement({
					key: eitherFieldIdentifiers.tag,
					value: registerEitherTag(context, "value", valueInformation),
				}),
				GoAST.createKeyedElement({
					key: eitherFieldIdentifiers.value,
					value: expression,
				}),
			],
		});
	}

	if (produced.kind === "any") {
		const goType = await concreteGoType(target.type, node, context);

		if (DEither.isLeft(goType)) {
			return undefined;
		}

		// Un objet ou un tableau `any` utilisé comme `User` : recopié champ par champ
		// (par nom, quel que soit l'ordre), car son struct Go peut être différent (D-20).
		return needsConversion(GoPrinter.renderNode(goType))
			? asTyped(context, expression, goType)
			: assertTo(expression, goType);
	}

	return undefined;
}

/**
 * Enveloppe une liste de transformeurs d'expressions : le résultat est adapté
 * au type attendu à cet endroit (voir `adaptExpression`).
 */
export function createAdaptedExpressionTransformer(
	getTransformers: () => readonly Transformer<GoAST.Expression>[],
): Transformer<GoAST.Expression> {
	return createTransformer<GoAST.Expression>(
		async(node, context) => {
			const transformed = await context.transform(node, getTransformers());

			if (DEither.isLeft(transformed) || !TsAST.isExpression(node)) {
				return transformed;
			}

			const { result, before } = DEither.unwrapRight(transformed);
			const adapted = await adaptExpression(node, result, context);

			return adapted
				? context.success({
					before,
					result: adapted,
				})
				: transformed;
		},
	);
}
