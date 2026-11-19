import { type Transformer } from "@transformer";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DGenerator from "@duplojs/lang/generator";
import { SignatureKind } from "typescript/async";
import { type BuildContext } from "../../../../context/build";
import { expressionTransformers } from "../../../expression";
import { tsTypeToGo } from "../../../type/tsTypeToGo";
import { eitherAnyGoType } from "../core/analysis";
import { inferParameter, transformCallback } from "../core/callback";
import { readEitherIssues } from "../core/issues";
import { eitherAnyTypeIdentifier, eitherCoreDependency, eitherFieldIdentifiers } from "../core/sharedDependency";
import { registerEitherTag } from "../core/tag";
import { rightThenDependency, rightThenIdentifier } from "./sharedDependency";

/** Signature de l'étape : renvoie-t-elle un Either ? quel type Go reçoit-elle ? */
async function readStep(step: TsAST.Expression, context: BuildContext) {
	const { typeChecker } = context.transpilation;
	const signature = DArray.first(
		await typeChecker.getSignaturesOfType(
			await typeChecker.getTypeAtLocation(step),
			SignatureKind.Call,
		),
	);

	if (!signature) {
		return context.error(step, "right-pipe-step-without-call-signature");
	}

	const returnType = await signature.getReturnType();
	const awaitedReturnType = await typeChecker.getAwaitedType(returnType) ?? returnType;
	const returnsEither = await readEitherIssues(awaitedReturnType, step, context);

	if (DEither.isLeft(returnsEither) && !DEither.hasInformation(returnsEither, "none")) {
		return returnsEither;
	}

	const parameter = DArray.first(await signature.getParameters());
	const parameterType = parameter
		? await tsTypeToGo(await typeChecker.getTypeOfSymbol(parameter), step, context)
		: DEither.right("go-type", GoAST.builtinTypeReferences.any);

	if (DEither.isLeft(parameterType)) {
		return parameterType;
	}

	return DEither.success({
		returnsEither: DEither.isRight(returnsEither),
		parameterType: DEither.unwrapRight(parameterType),
		hasParameter: parameter !== undefined,
	});
}

/**
 * Étape qui renvoie une **valeur brute** : DuploJS la range dans un `success`.
 * `func(value T) EitherAny { return EitherAny{Tag: TagRightSuccess, Value: step(value)} }`
 */
function wrapRawStep(
	step: GoAST.Expression,
	parameterType: GoAST.TypeReference | GoAST.Type,
	hasParameter: boolean,
	context: BuildContext,
) {
	const value = context.generateIdentifier();

	return GoAST.createFunctionLiteral({
		arguments: [
			GoAST.createFunctionArgument({
				identifier: value,
				type: parameterType,
			}),
		],
		returnTypes: [eitherAnyGoType(context)],
		body: GoAST.createBlockStatement({
			statements: [
				GoAST.createReturnStatement({
					values: DCommon.cast([
						GoAST.createStructLiteral({
							typeReference: GoAST.createPackageTypeReference({
								packageName: context.registerSharedDependency(eitherCoreDependency.value),
								identifier: eitherAnyTypeIdentifier,
							}),
							elements: [
								GoAST.createKeyedElement({
									key: eitherFieldIdentifiers.tag,
									value: registerEitherTag(context, "right", "success"),
								}),
								GoAST.createKeyedElement({
									key: eitherFieldIdentifiers.value,
									value: GoAST.createCallExpression({
										callee: step,
										arguments: hasParameter ? [value] : [],
									}),
								}),
							],
						}),
					]),
				}),
			],
		}),
	});
}

/**
 * `DEither.rightPipe(r, f, g)` -> `RightThen(RightThen(r, f), g)` (D-18).
 * Chaque étape reçoit la valeur ouverte avec le type qu'elle déclare. Une étape
 * qui renvoie une valeur brute est rangée dans un `success`, comme en DuploJS.
 */
export async function rightPipeExpressionHandler(
	node: TsAST.Node,
	context: BuildContext,
	unwrapPromiseInput = false,
): Promise<ReturnType<Transformer<GoAST.Expression>["transformer"]>> {
	if (!TsAST.isCallExpression(node) || node.arguments.length < 2) {
		return context.error(node, "right-pipe-expects-an-input-and-steps");
	}

	const [input, ...steps] = node.arguments as unknown as [TsAST.Expression, ...TsAST.Expression[]];

	const inputType = await context.transpilation.typeChecker.getTypeAtLocation(input);
	const analyzedInputType = unwrapPromiseInput
		? await context.transpilation.typeChecker.getAwaitedType(inputType) ?? inputType
		: inputType;
	const inputIssues = await readEitherIssues(analyzedInputType, input, context);
	if (DEither.isLeft(inputIssues) && !DEither.hasInformation(inputIssues, "none")) {
		return inputIssues;
	}

	const inputExpression = await DCommon.asyncPipe(
		context.transform(input, expressionTransformers.value),
		DEither.unwrapRight,
	);

	if (DEither.isLeft(inputExpression)) {
		return inputExpression;
	}
	const initialResult = DEither.isRight(inputIssues)
		? inputExpression.result
		: GoAST.createStructLiteral({
			typeReference: GoAST.createPackageTypeReference({
				packageName: context.registerSharedDependency(eitherCoreDependency.value),
				identifier: eitherAnyTypeIdentifier,
			}),
			elements: [
				GoAST.createKeyedElement({
					key: eitherFieldIdentifiers.tag,
					value: registerEitherTag(context, "right", "success"),
				}),
				GoAST.createKeyedElement({
					key: eitherFieldIdentifiers.value,
					value: inputExpression.result,
				}),
			],
		});

	const packageName = context.registerSharedDependency(rightThenDependency.value);

	const piped = await DCommon.asyncPipe(
		steps,
		DGenerator.asyncReduce(
			DGenerator.reduceFrom<{
				before: readonly GoAST.Statement[];
				result: GoAST.Expression;
			}>({
				before: inputExpression.before,
				result: initialResult,
			}),
			async({ item, lastValue, next, exit }) => {
				const stepShape = await DCommon.asyncPipe(readStep(item, context), DEither.unwrapRight);

				if (DEither.isLeft(stepShape)) {
					return exit(stepShape);
				}

				const step = await DCommon.asyncPipe(
					transformCallback(
						{
							node: item,
							parameterTypes: [inferParameter],
							returnType: stepShape.returnsEither ? eitherAnyGoType(context) : undefined,
						},
						context,
					),
					DEither.unwrapRight,
				);

				if (DEither.isLeft(step)) {
					return exit(step);
				}

				const stepFunction = stepShape.returnsEither
					? step.result
					: wrapRawStep(step.result, stepShape.parameterType, stepShape.hasParameter, context);

				return next({
					before: DArray.concat(lastValue.before, step.before),
					result: GoAST.createCallExpression({
						callee: GoAST.createSelectorExpression({
							target: packageName,
							identifier: rightThenIdentifier,
						}),
						arguments: [lastValue.result, stepFunction],
					}),
				});
			},
		),
	);

	if (DEither.isLeft(piped)) {
		return piped;
	}

	return context.success(piped);
}
