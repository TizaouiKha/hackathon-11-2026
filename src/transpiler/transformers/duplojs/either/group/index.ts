import { type Transformer } from "@transformer";
import { GoAST, GoPrinter } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { analyzeEitherOfType, eitherAnyGoType, sideValueGoType } from "../core/analysis";
import { tsTypeToGo } from "../../../type/tsTypeToGo";
import { go } from "../../../shared/goBuilder";
import { registerEitherTag } from "../core/tag";
import { groupDependency, groupIdentifier } from "./sharedDependency";

/**
 * `DEither.group(results)` -> `shard_dependencies.Group[T](results)`.
 * `DEither.group({ a, b })` (objet) : traduit sur place, voir `groupObject`.
 */
export async function groupExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node) || node.arguments.length !== 1) {
		return context.error(node, "group-expects-one-argument");
	}

	const input = DArray.first(node.arguments);
	if (!input) {
		return context.error(node, "group-expects-one-argument");
	}

	if (TsAST.isObjectLiteralExpression(input)) {
		return groupObject(node, input, context);
	}

	const inputType = await context.transpilation.typeChecker.getTypeAtLocation(input);
	if (
		!(await context.transpilation.typeChecker.isArrayType(inputType))
		|| !inputType.isTypeReference()
	) {
		return context.error(input, "group-expects-an-array");
	}

	const elementType = DArray.first(
		await context.transpilation.typeChecker.getTypeArguments(inputType),
	);
	if (!elementType) {
		return context.error(input, "group-array-without-element-type");
	}

	const shape = await DCommon.asyncPipe(
		analyzeEitherOfType(elementType, input, context),
		DEither.unwrapRight,
	);
	if (DEither.isLeft(shape)) {
		return shape;
	}

	const valueType = await DCommon.asyncPipe(
		sideValueGoType(shape, "right", input, context),
		DEither.unwrapRight,
	);
	if (DEither.isLeft(valueType)) {
		return valueType;
	}

	const translated = await DCommon.asyncPipe(
		context.transform(input, expressionTransformers.value),
		DEither.unwrapRight,
	);
	if (DEither.isLeft(translated)) {
		return translated;
	}

	const packageName = context.registerSharedDependency(groupDependency.value);
	registerEitherTag(context, "right", "success");

	return context.success({
		before: translated.before,
		result: GoAST.createCallExpression({
			callee: GoAST.createInstantiationExpression({
				target: GoAST.createSelectorExpression({
					target: packageName,
					identifier: groupIdentifier,
				}),
				typeArguments: DCommon.cast([valueType]),
			}),
			arguments: [translated.result],
		}),
	});
}

interface GroupEntry {
	readonly name: string;
	readonly node: TsAST.Expression;

	/** `() => calcul()` : appelée seulement à son tour (comme DuploJS). */
	readonly isThunk: boolean;
}

function readEntries(input: TsAST.ObjectLiteralExpression, context: BuildContext) {
	const entries: GroupEntry[] = [];

	for (const property of input.properties) {
		if (!TsAST.isPropertyAssignment(property) && !TsAST.isShorthandPropertyAssignment(property)) {
			return context.error(property, "group-object-property-not-supported-yet");
		}

		if (!TsAST.isIdentifier(property.name) && !TsAST.isStringLiteral(property.name)) {
			return context.error(property, "group-object-property-not-supported-yet");
		}

		const value = TsAST.isPropertyAssignment(property) ? property.initializer : property.name;

		entries.push({
			name: property.name.text,
			node: value,
			isThunk: TsAST.isArrowFunction(value) || TsAST.isFunctionExpression(value),
		});
	}

	return DEither.success<readonly GroupEntry[]>(entries);
}

/**
 * `DEither.group({ a, b: () => calcul() })` (D-19). Comme DuploJS : les valeurs
 * sont évaluées dans l'ordre ; une fonction n'est appelée qu'à son tour ; le
 * premier résultat qui n'est pas un succès est renvoyé tel quel ; sinon
 * `success({ a: …, b: … })`, chaque valeur ouverte avec le type que TS connaît.
 * ```go
 * a := …                       // valeurs (non fonctions) d'abord, dans l'ordre
 * var result EitherAny
 * if !a.Tag.IsRight() { result = a } else {
 *     b := thunk()             // fonction : appelée seulement ici
 *     if !b.Tag.IsRight() { result = b } else {
 *         result = EitherAny{Tag: TagRightSuccess, Value: struct{…}{Sourced_a: a.Value.(T), …}}
 *     }
 * }
 * ```
 */
async function groupObject(
	call: TsAST.CallExpression,
	input: TsAST.ObjectLiteralExpression,
	context: BuildContext,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	const { typeChecker } = context.transpilation;
	const entries = await DCommon.asyncPipe(readEntries(input, context), DEither.unwrapRight);

	if (DEither.isLeft(entries)) {
		return entries;
	}

	// Type de la valeur du succès : l'objet des valeurs ouvertes.
	const shape = await DCommon.asyncPipe(
		analyzeEitherOfType(await typeChecker.getTypeAtLocation(call), call, context),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(shape)) {
		return shape;
	}

	const successIssue = DArray.find(shape.issues, (issue) => issue.side === "right");

	if (!successIssue?.valueType) {
		return context.error(call, "group-object-without-success-type");
	}

	const successGoType = await tsTypeToGo(successIssue.valueType, call, context);

	if (DEither.isLeft(successGoType)) {
		return successGoType;
	}

	const before: GoAST.Statement[] = [];
	const values = new Map<string, GoAST.Identifier>();
	const thunks = new Map<string, GoAST.Expression>();

	for (const entry of entries) {
		const value = await DCommon.asyncPipe(
			context.transform(entry.node, expressionTransformers.value),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(value)) {
			return value;
		}

		before.push(...value.before);

		if (entry.isThunk) {
			thunks.set(entry.name, value.result);
			continue;
		}

		const variable = context.generateIdentifier();

		before.push(go.declare(variable.value, value.result));
		values.set(entry.name, variable);
	}

	const result = context.generateIdentifier();
	const fields: GoAST.KeyedElement<GoAST.Identifier>[] = [];

	for (const entry of entries) {
		const fieldType = await typeChecker.getTypeOfPropertyOfType(successIssue.valueType, entry.name);
		const fieldGoType = fieldType && await tsTypeToGo(fieldType, call, context);

		if (!fieldGoType || DEither.isLeft(fieldGoType)) {
			return fieldGoType ?? context.error(call, "group-object-field-without-type");
		}

		const variable = values.get(entry.name) ?? GoAST.createIdentifier(`${result.value}_${fields.length}`);

		values.set(entry.name, variable);

		const opened = go.select(variable, "Value");

		fields.push(GoAST.createKeyedElement({
			key: context.createSourceIdentifier(entry.name),
			value: GoPrinter.renderNode(DEither.unwrapRight(fieldGoType)) === "any"
				? opened
				: go.assert(opened, DEither.unwrapRight(fieldGoType)),
		}));
	}

	const success = go.assign([result], [
		GoAST.createStructLiteral({
			typeReference: eitherAnyGoType(context) as GoAST.TypeReference,
			elements: [
				GoAST.createKeyedElement({
					key: GoAST.createIdentifier("Tag"),
					value: registerEitherTag(context, "right", "success"),
				}),
				GoAST.createKeyedElement({
					key: GoAST.createIdentifier("Value"),
					value: GoAST.createStructLiteral({
						typeReference: DEither.unwrapRight(successGoType) as GoAST.StructType,
						elements: fields,
					}),
				}),
			],
		}),
	]);

	// Chaîne de tests, construite depuis la fin : chaque fonction n'est appelée
	// que si tous les résultats précédents sont des succès.
	const chain = [...entries].reverse().reduce<readonly GoAST.Statement[]>(
		(next, entry) => {
			const variable = values.get(entry.name) ?? result;
			const thunk = thunks.get(entry.name);

			return [
				...thunk ? [go.declare(variable.value, go.call(thunk))] : [],
				go.when(
					go.not(go.call(go.select(go.select(variable, "Tag"), "IsRight"))),
					[go.assign([result], [variable])],
					next,
				),
			];
		},
		[success],
	);

	return context.success({
		before: [
			...before,
			GoAST.createVariableDeclarationZeroValue({
				identifier: result,
				typeReference: eitherAnyGoType(context),
			}),
			...chain,
		],
		result,
	});
}
