import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import { GoAST, GoPrinter } from "@go";
import { createTransformer, type Transformer } from "@transformer";
import { TsAST } from "@typescript";
import { SymbolFlags, type Type } from "typescript/async";
import type { BuildContext } from "../../../context/build";
import { expressionTransformers } from "../../expression";
import { targetType } from "../../expression/adapt";
import { convertStructurally } from "../../expression/structuralConversion";
import { go } from "../../shared/goBuilder";
import { tsTypeToGo, type GoType } from "../../type/tsTypeToGo";
import { transformCallback } from "../either/core/callback";
import {
	translateCurried,
	translateFunctionValue,
	translateWithData,
	type EitherOperand,
	type EitherOperation,
} from "../either/core/operand";
import { objectDependency, overrideFieldIdentifier } from "./sharedDependency";

/**
 * Domaine `@duplojs/lang/object` (`DObject.*`, D-24).
 *
 * Toutes ces fonctions travaillent sur la **forme** de l'objet, que TypeScript
 * connaît à la compilation. Le résultat est donc construit directement : un struct
 * rempli champ par champ (comme l'objet temporaire de D-21), une liste de noms,
 * une lecture de champ. Aucune réflexion à l'exécution.
 * ```go
 * // DObject.pick(user, ["name"])
 * struct{ Sourced_name string }{Sourced_name: Sourced_user.Sourced_name}
 * ```
 * L'objet source n'est évalué qu'une fois (variable temporaire si besoin).
 */

type HandlerResult = ReturnType<Transformer<GoAST.Expression>["transformer"]>;
type ObjectHandler = (node: TsAST.Node, context: BuildContext) => Promise<HandlerResult>;
type Failure = Extract<Awaited<HandlerResult>, DEither.Left>;

interface BoundSource {
	readonly before: readonly GoAST.Statement[];
	readonly source: GoAST.Expression;
}

function isSimple(expression: GoAST.Expression): boolean {
	return DModeling.hasTagValue(expression, "[node]identifier")
		|| (DModeling.hasTagValue(expression, "[node][expression]selector")
			&& isSimple((expression as GoAST.SelectorExpression).target as GoAST.Expression));
}

/** La source dans une variable si la relire plusieurs fois la recalculerait. */
function bind(before: readonly GoAST.Statement[], expression: GoAST.Expression, context: BuildContext): BoundSource {
	if (isSimple(expression)) {
		return {
			before,
			source: expression,
		};
	}

	const identifier = context.generateIdentifier();

	return {
		before: [
			...before,
			GoAST.createShortVariableDeclarationStatement({
				identifier,
				initializer: expression,
			}),
		],
		source: identifier,
	};
}

function readField(source: GoAST.Expression, name: string, context: BuildContext) {
	return GoAST.createSelectorExpression({
		target: source,
		identifier: context.createSourceIdentifier(name),
	});
}

async function goTypeOf(type: Type, node: TsAST.Node, context: BuildContext) {
	return DCommon.asyncPipe(tsTypeToGo(type, node, context), DEither.unwrapRight);
}

async function isStruct(type: Type, node: TsAST.Node, context: BuildContext) {
	const goType = await goTypeOf(type, node, context);

	return !DEither.isLeft(goType) && GoPrinter.renderNode(goType).startsWith("struct");
}

/** Lecture d'un champ de `source`, convertie si le champ attendu a une autre forme (D-21). */
interface FieldRead {
	readonly source: GoAST.Expression;
	readonly sourceType: Type;
	readonly name: string;
	readonly target: Type;
}

async function readConverted({ source, sourceType, name, target }: FieldRead, node: TsAST.Node, context: BuildContext) {
	const read = readField(source, name, context);
	const sourceField = await context.transpilation.typeChecker.getTypeOfPropertyOfType(sourceType, name);
	const converted = sourceField && await convertStructurally({
		value: read,
		source: sourceField,
		target,
	}, node, context);

	return converted ?? read;
}

/** Struct du type `output`, chaque champ donné par `valueOf`. */
async function buildStruct(
	output: Type,
	node: TsAST.Node,
	context: BuildContext,
	valueOf: (name: string, fieldType: Type) => Promise<GoAST.Expression | Failure>,
): Promise<GoAST.Expression | Failure> {
	const goType = await goTypeOf(output, node, context);

	if (DEither.isLeft(goType) || !GoPrinter.renderNode(goType).startsWith("struct")) {
		return context.error(node, "dobject-result-must-be-an-object");
	}

	const { typeChecker } = context.transpilation;
	const elements: GoAST.KeyedElement<GoAST.Identifier>[] = [];

	for (const property of await typeChecker.getPropertiesOfType(output)) {
		const value = await valueOf(property.name, await typeChecker.getTypeOfSymbol(property));

		if (DEither.isLeft(value)) {
			return value;
		}

		elements.push(GoAST.createKeyedElement({
			key: context.createSourceIdentifier(property.name),
			value,
		}));
	}

	return GoAST.createStructLiteral({
		typeReference: goType as GoAST.StructType,
		elements,
	});
}

async function requireStructSource(operand: EitherOperand, context: BuildContext) {
	return await isStruct(operand.type, operand.node, context)
		? undefined
		: context.error(operand.node, "dobject-expects-an-object-with-a-known-shape");
}

function success(context: BuildContext, before: readonly GoAST.Statement[], result: GoAST.Expression | Failure) {
	return DEither.isLeft(result)
		? result
		: context.success({
			before,
			result,
		});
}

/** `pick` et `omit` : le type du résultat dit quels champs garder. */
function reshapeOperation(context: BuildContext): EitherOperation {
	return async(operand, outputType) => {
		const invalid = await requireStructSource(operand, context);

		if (invalid) {
			return invalid;
		}

		const { before, source } = bind(operand.before, operand.expression, context);
		const result = await buildStruct(
			outputType,
			operand.node,
			context,
			(name, fieldType) => readConverted({
				source,
				sourceType: operand.type,
				name,
				target: fieldType,
			}, operand.node, context),
		);

		return success(context, before, result);
	};
}

/** Valeur TS et Go d'un argument objet (`assign(user, { name })`), après adaptation. */
async function prepareObjectArgument(value: TsAST.Expression, context: BuildContext) {
	const prepared = await context.transformPrepared(value, expressionTransformers.value);

	if (DEither.isLeft(prepared)) {
		return prepared;
	}

	const type = (await targetType(value, context))?.type
		?? await context.transpilation.typeChecker.getTypeAtLocation(value);

	return {
		...bind(prepared.before, prepared.operand, context),
		type,
	};
}

async function isOptionalProperty(type: Type, name: string, context: BuildContext) {
	const property = (await context.transpilation.typeChecker.getPropertiesOfType(type))
		.find((candidate) => candidate.name === name);

	return property ? (property.flags & SymbolFlags.Optional) !== 0 : undefined;
}

/**
 * `assign(objet, valeur)` (`{ ...objet, ...valeur }`) et `override(objet, valeur)`
 * (idem, mais une valeur `undefined` ne remplace rien : `OverrideField`).
 */
function mergeOperation(kind: "assign" | "override", value: TsAST.Expression, context: BuildContext): EitherOperation {
	return async(operand, outputType) => {
		const invalid = await requireStructSource(operand, context);

		if (invalid) {
			return invalid;
		}

		const object = bind(operand.before, operand.expression, context);
		const valueSide = await prepareObjectArgument(value, context);

		if (DEither.isLeft(valueSide)) {
			return valueSide;
		}

		const result = await buildStruct(outputType, operand.node, context, async(name, fieldType) => {
			const optional = await isOptionalProperty(valueSide.type, name, context);

			if (optional === undefined) {
				return readConverted({
					source: object.source,
					sourceType: operand.type,
					name,
					target: fieldType,
				}, operand.node, context);
			}

			if (!optional) {
				return readConverted({
					source: valueSide.source,
					sourceType: valueSide.type,
					name,
					target: fieldType,
				}, value, context);
			}

			// Champ facultatif : JS distingue « absent » et « présent mais undefined », Go non.
			if (kind === "assign") {
				return context.error(value, "assign-with-optional-property-not-supported-yet");
			}

			return go.call(
				go.select(context.registerSharedDependency(objectDependency.value), overrideFieldIdentifier.value),
				[readField(valueSide.source, name, context), readField(object.source, name, context)],
			);
		});

		return success(context, [...object.before, ...valueSide.before], result);
	};
}

/** Une clé littérale (`"name"`) : TypeScript en connaît la valeur. */
async function literalKey(node: TsAST.Expression, context: BuildContext) {
	const type = await context.transpilation.typeChecker.getTypeAtLocation(node);

	return type.isStringLiteralType() ? type.value : undefined;
}

function getPropertyOperation(key: TsAST.Expression, deep: boolean, context: BuildContext): EitherOperation {
	return async(operand) => {
		const invalid = await requireStructSource(operand, context);
		const name = await literalKey(key, context);

		if (invalid) {
			return invalid;
		}

		if (name === undefined) {
			return context.error(key, "dobject-key-must-be-a-literal");
		}

		const path = deep ? name.split(".") : [name];
		const result = path.reduce<GoAST.Expression>(
			(target, part) => readField(target, part, context),
			operand.expression,
		);

		return context.success({
			before: operand.before,
			result,
		});
	};
}

function transformPropertyOperation(
	key: TsAST.Expression,
	transform: TsAST.Expression,
	context: BuildContext,
): EitherOperation {
	return async(operand, outputType) => {
		const invalid = await requireStructSource(operand, context);
		const name = await literalKey(key, context);

		if (invalid) {
			return invalid;
		}

		if (name === undefined) {
			return context.error(key, "dobject-key-must-be-a-literal");
		}

		const { typeChecker } = context.transpilation;
		const sourceField = await typeChecker.getTypeOfPropertyOfType(operand.type, name);
		const outputField = await typeChecker.getTypeOfPropertyOfType(outputType, name);
		const sourceGo = sourceField && await goTypeOf(sourceField, operand.node, context);
		const outputGo = outputField && await goTypeOf(outputField, operand.node, context);

		if (!sourceGo || !outputGo || DEither.isLeft(sourceGo) || DEither.isLeft(outputGo)) {
			return context.error(key, "transform-property-field-type-not-supported");
		}

		const callback = await DCommon.asyncPipe(
			transformCallback({
				node: transform,
				parameterTypes: [sourceGo],
				returnType: outputGo,
			}, context),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(callback)) {
			return callback;
		}

		const { before, source } = bind(operand.before, operand.expression, context);
		const result = await buildStruct(outputType, operand.node, context, (field, fieldType) => (
			field === name
				? Promise.resolve(go.call(callback.result, [readField(source, name, context)]))
				: readConverted({
					source,
					sourceType: operand.type,
					name: field,
					target: fieldType,
				}, operand.node, context)
		));

		return success(context, [...before, ...callback.before], result);
	};
}

type ListingKind = "keys" | "values" | "entries" | "countKeys";

/**
 * `keys`, `values`, `entries`, `countKeys` : la liste des champs vient du type.
 * Un champ facultatif peut manquer à l'exécution (JS ne le listerait pas) : refusé.
 */
function listingOperation(kind: ListingKind, context: BuildContext): EitherOperation {
	return async(operand, outputType) => {
		const invalid = await requireStructSource(operand, context);

		if (invalid) {
			return invalid;
		}

		const properties = await context.transpilation.typeChecker.getPropertiesOfType(operand.type);

		if (properties.some((property) => (property.flags & SymbolFlags.Optional) !== 0)) {
			return context.error(operand.node, `${kind}-with-optional-properties-not-supported-yet`);
		}

		if (kind === "countKeys") {
			return context.success({
				before: operand.before,
				result: go.convert(go.types.float64, go.int(properties.length)),
			});
		}

		const outputGo = await goTypeOf(outputType, operand.node, context);

		if (DEither.isLeft(outputGo) || !(DModeling.hasTagValue(outputGo, "[node][type]slice"))) {
			return context.error(operand.node, `${kind}-result-must-be-a-slice`);
		}

		const sliceType = outputGo as GoAST.SliceType;
		const { before, source } = bind(operand.before, operand.expression, context);
		const entryType = sliceType.elementType as GoType;

		if (kind === "entries" && !DModeling.hasTagValue(entryType, "[node][type]slice")) {
			return context.error(operand.node, "entries-element-must-be-a-tuple");
		}

		const elements = properties.map((property) => {
			const name = GoAST.createStringLiteral({ value: property.name });
			const value = readField(source, property.name, context);

			if (kind === "keys") {
				return name;
			}

			return kind === "values"
				? value
				: GoAST.createSliceLiteral({
					typeReference: entryType as GoAST.SliceType,
					elements: [name, value],
				});
		});

		return context.success({
			before,
			result: GoAST.createSliceLiteral({
				typeReference: sliceType,
				elements,
			}),
		});
	};
}

async function asFunctionValue(
	node: TsAST.Node,
	operation: EitherOperation,
	context: BuildContext,
): Promise<HandlerResult> {
	const expectedType = TsAST.isExpression(node)
		? await context.transpilation.typeChecker.getContextualType(node)
		: undefined;

	if (!expectedType || !TsAST.isExpression(node)) {
		return context.error(node, "dobject-function-as-value-needs-an-expected-type");
	}

	return translateFunctionValue(node, expectedType, operation, context);
}

/**
 * Une fonction `DObject` avec données (`n` arguments, l'objet d'abord) ou
 * curryfiée (`n - 1` arguments). `operation` reçoit les arguments sans l'objet.
 */
function withData(
	name: string,
	arity: number,
	operation: (others: readonly TsAST.Expression[], context: BuildContext) => EitherOperation,
): ObjectHandler {
	return (node, context) => {
		if (!TsAST.isCallExpression(node)) {
			return arity === 1
				? asFunctionValue(node, operation([], context), context)
				: Promise.resolve(context.error(node, `${name}-must-be-called`));
		}

		const argumentsList = node.arguments as unknown as readonly TsAST.Expression[];

		if (argumentsList.length === arity) {
			return translateWithData(node, operation(argumentsList.slice(1), context), context);
		}

		if (arity > 1 && argumentsList.length === arity - 1) {
			return translateCurried(node, operation(argumentsList, context), context);
		}

		return Promise.resolve(context.error(node, `${name}-unexpected-number-of-arguments`));
	};
}

const objectHandlers: Record<string, ObjectHandler> = {
	pick: withData("pick", 2, (_others, context) => reshapeOperation(context)),
	omit: withData("omit", 2, (_others, context) => reshapeOperation(context)),
	assign: withData("assign", 2, ([value], context) => mergeOperation("assign", value!, context)),
	override: withData("override", 2, ([value], context) => mergeOperation("override", value!, context)),
	getProperty: withData("getProperty", 2, ([key], context) => getPropertyOperation(key!, false, context)),
	getDeepProperty: withData("getDeepProperty", 2, ([path], context) => getPropertyOperation(path!, true, context)),
	transformProperty: withData(
		"transformProperty",
		3,
		([key, transform], context) => transformPropertyOperation(key!, transform!, context),
	),
	keys: withData("keys", 1, (_others, context) => listingOperation("keys", context)),
	values: withData("values", 1, (_others, context) => listingOperation("values", context)),
	entries: withData("entries", 1, (_others, context) => listingOperation("entries", context)),
	countKeys: withData("countKeys", 1, (_others, context) => listingOperation("countKeys", context)),
};

/** Routeur du domaine `@duplojs/lang/object`. Une entrée par fonction prise en charge. */
export const duploJSObjectExpressionTransformer: Transformer<GoAST.Expression> = createTransformer(
	async(node, context) => {
		const reference = TsAST.isCallExpression(node)
			? node.expression
			: node;

		if (!TsAST.isIdentifier(reference) && !TsAST.isPropertyAccessExpression(reference)) {
			return context.notSupport();
		}

		const moduleReference = await DCommon.asyncPipe(
			context.resolveReferenceModule(reference, "@duplojs/lang", /^dist\/object\//),
			DEither.unwrapRight,
		);

		if (DEither.isLeft(moduleReference)) {
			return context.notSupport();
		}

		const { name } = moduleReference.symbol;

		return Object.hasOwn(objectHandlers, name)
			? objectHandlers[name]!(node, context)
			: context.notSupport();
	},
);
