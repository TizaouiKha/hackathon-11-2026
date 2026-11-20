import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { GoAST, GoPrinter } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { TypeFlags, type Type } from "typescript/async";
import type { BuildContext } from "../../context/build";
import { tsTypeToGo, type GoType } from "../type/tsTypeToGo";
import { go } from "../shared/goBuilder";
import { jsStringDependency, jsStringIdentifiers } from "../duplojs/string/core/sharedDependency";
import { undefinedShardDependency } from "../../sharedDependency/defaults";
import { javascriptValue } from "./javascriptValues";
import { getProperty } from "./javascriptObjects";
import { knownUnionMembers, type UnionMember } from "../type/unionMembers";
import { expressionTransformers } from ".";

/**
 * Accès aux propriétés et aux éléments (D-19).
 * | TypeScript | Go |
 * |---|---|
 * | `user.name` (objet) | `user.Sourced_name` |
 * | `values.length` (tableau, tuple) | `float64(len(values))` |
 * | `text.length` (chaîne) | `JSStringLength(text)` (unités UTF-16, D-18.4) |
 * | `record.key`, `record[key]` | `JSMapGet(record, key)` (`undefined` si absente) |
 * | `tuple[1]` (type exact) | `tuple[1]`, ou `tuple[1].(T)` si la slice est un `[]any` |
 * | `values[i]` (`T \| undefined`) | `JSElementAt(values, i)` (`undefined` hors du tableau) |
 */

type Result = Awaited<ReturnType<Transformer<GoAST.Expression>["transformer"]>>;

function render(type: GoType) {
	return GoPrinter.renderNode(type);
}

async function goTypeOf(type: Type, node: TsAST.Node, context: BuildContext) {
	return DCommon.asyncPipe(tsTypeToGo(type, node, context), DEither.unwrapRight);
}

async function isArrayLike(type: Type, context: BuildContext) {
	const { typeChecker } = context.transpilation;

	return await typeChecker.isArrayType(type) || await typeChecker.isTupleType(type);
}

/**
 * Contrat des transformers (D-18.2) : le Go produit a le type Go du type TS de
 * l'expression. Un helper qui renvoie `any` est ouvert quand TS connaît mieux.
 */
async function fitAny(expression: GoAST.Expression, node: TsAST.Expression, context: BuildContext) {
	const expected = await goTypeOf(await context.transpilation.typeChecker.getTypeAtLocation(node), node, context);

	if (DEither.isLeft(expected)) {
		return expected;
	}

	return DEither.success(
		render(expected) === "any" ? expression : go.assert(expression, expected),
	);
}

async function transformTarget(node: TsAST.Expression, context: BuildContext) {
	return DCommon.asyncPipe(
		context.transform(node, expressionTransformers.value),
		DEither.unwrapRight,
	);
}

function stringLength(target: GoAST.Expression, context: BuildContext) {
	context.registerSharedDependency(undefinedShardDependency.value);

	return go.call(
		GoAST.createSelectorExpression({
			target: context.registerSharedDependency(jsStringDependency.value),
			identifier: jsStringIdentifiers.length,
		}),
		[target],
	);
}

/**
 * `shape.kind` sur une union d'objets connus (D-27) : chaque membre est rangé
 * sous son type Go exact, un `switch` sur le type lit le bon champ.
 * ```go
 * func(value any) string {
 *     switch value.(type) {
 *     case Circle: return value.(Circle).Sourced_kind
 *     case Square: return value.(Square).Sourced_kind
 *     }
 *     panic("union : type inattendu")
 * }(shape)
 * ```
 * `undefined` : un membre n'est pas un objet, ou son champ n'a pas le bon type.
 */
interface UnionFieldRead {
	readonly target: GoAST.Expression;
	readonly name: string;
}

async function readUnionField(
	members: readonly UnionMember[],
	{ target, name }: UnionFieldRead,
	node: TsAST.PropertyAccessExpression,
	context: BuildContext,
) {
	const { typeChecker } = context.transpilation;
	const resultGo = await goTypeOf(await typeChecker.getTypeAtLocation(node), node, context);

	if (DEither.isLeft(resultGo) || !members.every((member) => member.rendered.startsWith("struct"))) {
		return undefined;
	}

	const result = DEither.unwrapRight(resultGo);
	const value = go.id("value");
	const cases: GoAST.TypeSwitchCase[] = [];

	for (const member of members) {
		const fieldType = await typeChecker.getTypeOfPropertyOfType(member.types[0]!, name);
		const fieldGo = fieldType && await goTypeOf(fieldType, node, context);

		if (!fieldGo || DEither.isLeft(fieldGo)) {
			return undefined;
		}

		const read = GoAST.createSelectorExpression({
			target: go.assert(value, member.goType),
			identifier: context.createSourceIdentifier(name),
		});
		const fieldRendered = render(DEither.unwrapRight(fieldGo));
		const resultRendered = render(result);

		if (fieldRendered !== resultRendered && resultRendered !== "any" && fieldRendered !== "any") {
			return undefined;
		}

		cases.push(GoAST.createTypeSwitchCase({
			types: DCommon.cast([member.goType]),
			statements: [go.return(fieldRendered === "any" && resultRendered !== "any" ? go.assert(read, result) : read)],
		}));
	}

	return go.call(
		GoAST.createFunctionLiteral({
			arguments: [go.parameter("value", go.types.any)],
			returnTypes: [result],
			body: go.block([
				GoAST.createTypeSwitchStatementWithoutDefault({
					expression: value,
					cases: DCommon.cast(cases),
				}),
				go.call("panic", [go.string("union : type inattendu")]) as unknown as GoAST.Statement,
			]),
		}),
		[target],
	);
}

export const propertyAccessTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context): Promise<Result> => {
		if (!TsAST.isPropertyAccessExpression(node) || !TsAST.isIdentifier(node.name)) {
			return context.notSupport();
		}

		if (node.questionDotToken) {
			return context.error(node, "optional-chaining-not-supported-yet");
		}

		const { typeChecker } = context.transpilation;
		const targetType = await typeChecker.getTypeAtLocation(node.expression);
		const name = node.name.text;
		const target = await transformTarget(node.expression, context);

		if (DEither.isLeft(target)) {
			return target;
		}

		const success = (result: GoAST.Expression) => context.success({
			before: target.before,
			result,
		});

		if (name === "length" && await isArrayLike(targetType, context)) {
			return success(go.convert(go.types.float64, go.call("len", [target.result])));
		}

		if (name === "length" && (targetType.flags & TypeFlags.StringLike) !== 0) {
			return success(stringLength(target.result, context));
		}

		const targetGoType = await goTypeOf(targetType, node.expression, context);

		if (DEither.isLeft(targetGoType)) {
			return targetGoType;
		}

		const rendered = render(DEither.unwrapRight(targetGoType));

		// `shape.kind` sur une union de types connus : un switch sur le type (D-27).
		const members = rendered === "any" ? await knownUnionMembers(targetType, node.expression, context) : undefined;
		const unionRead = members && await readUnionField(members, {
			target: target.result,
			name,
		}, node, context);

		if (unionRead) {
			return success(unionRead);
		}

		// `raw.name` sur un `any` : lecture par nom, à l'exécution, comme JS (D-20).
		if (rendered === "any") {
			const read = await fitAny(getProperty(context, target.result, go.string(name)), node, context);

			return DEither.isLeft(read) ? read : success(DEither.unwrapRight(read));
		}

		if (rendered.startsWith("struct")) {
			return success(GoAST.createSelectorExpression({
				target: target.result,
				identifier: context.createSourceIdentifier(name),
			}));
		}

		if (rendered.startsWith("map[")) {
			const read = await fitAny(
				go.call(javascriptValue(context, "mapGet"), [target.result, go.string(name)]),
				node,
				context,
			);

			return DEither.isLeft(read) ? read : success(DEither.unwrapRight(read));
		}

		// Méthode d'un tableau ou d'une chaîne (`values.map`, `text.trim`) : utiliser DArray / DString.
		return context.error(node, "property-access-not-supported-yet");
	},
);

export const elementAccessTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context): Promise<Result> => {
		if (!TsAST.isElementAccessExpression(node)) {
			return context.notSupport();
		}

		if (node.questionDotToken) {
			return context.error(node, "optional-chaining-not-supported-yet");
		}

		const { typeChecker } = context.transpilation;
		const targetType = await typeChecker.getTypeAtLocation(node.expression);
		const target = await transformTarget(node.expression, context);

		if (DEither.isLeft(target)) {
			return target;
		}

		const key = await transformTarget(node.argumentExpression, context);

		if (DEither.isLeft(key)) {
			return key;
		}

		const before = [...target.before, ...key.before];
		const targetGoType = await goTypeOf(targetType, node.expression, context);

		if (DEither.isLeft(targetGoType)) {
			return targetGoType;
		}

		const rendered = render(DEither.unwrapRight(targetGoType));

		if (rendered.startsWith("map[")) {
			const read = await fitAny(go.call(javascriptValue(context, "mapGet"), [target.result, key.result]), node, context);

			return DEither.isLeft(read)
				? read
				: context.success({
					before,
					result: DEither.unwrapRight(read),
				});
		}

		const keyType = await typeChecker.getTypeAtLocation(node.argumentExpression);

		// `raw["name"]` / `raw[cle]` sur un `any` : lecture par nom (D-20).
		if (rendered === "any" && (keyType.flags & TypeFlags.StringLike) !== 0) {
			const read = await fitAny(getProperty(context, target.result, key.result), node, context);

			return DEither.isLeft(read)
				? read
				: context.success({
					before,
					result: DEither.unwrapRight(read),
				});
		}

		if (!await isArrayLike(targetType, context) || !rendered.startsWith("[]")) {
			// `text[0]` : utiliser `DString.at` / `DString.charAt` (sémantique UTF-16).
			return context.error(node, "element-access-not-supported-yet");
		}

		const resultGoType = await goTypeOf(await typeChecker.getTypeAtLocation(node), node, context);

		if (DEither.isLeft(resultGoType)) {
			return resultGoType;
		}

		// `T | undefined` (`noUncheckedIndexedAccess`) : JS renvoie `undefined` hors du tableau.
		if (render(DEither.unwrapRight(resultGoType)) === "any") {
			return context.success({
				before,
				result: go.call(javascriptValue(context, "elementAt"), [target.result, key.result]),
			});
		}

		// Position connue de TS (tuple) : lecture directe, ouverte si la slice est un `[]any`.
		const read = go.index(target.result, go.convert(go.types.int, key.result));

		return context.success({
			before,
			result: rendered === "[]any" ? go.assert(read, DEither.unwrapRight(resultGoType)) : read,
		});
	},
);
