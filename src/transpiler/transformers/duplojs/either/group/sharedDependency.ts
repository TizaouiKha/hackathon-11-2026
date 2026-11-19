import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { eitherFieldIdentifiers } from "../core/sharedDependency";
import {
	argument,
	assertType,
	call,
	genericFunction,
	isRightCall,
	localEitherAny,
	localEitherAnyLiteral,
	returnValue,
	select,
} from "../core/goFunction";

export const groupIdentifier = GoAST.createIdentifier("Group");

/** Rassemble les succès et renvoie le premier échec rencontré. */
export const groupDependency = DCommon.memo(() => {
	const valueType = GoAST.createIdentifier("T");
	const results = GoAST.createIdentifier("results");
	const item = GoAST.createIdentifier("item");
	const values = GoAST.createIdentifier("values");
	const sliceType = GoAST.createSliceType({ elementType: valueType });

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			genericFunction({
				name: groupIdentifier,
				generic: [valueType],
				arguments: [
					argument(
						results,
						GoAST.createSliceType({ elementType: localEitherAny }),
					),
				],
				returnType: localEitherAny,
				statements: [
					GoAST.createShortVariableDeclarationStatement({
						identifier: values,
						initializer: GoAST.createCallExpression({
							callee: GoAST.createIdentifier("make"),
							typeArgument: sliceType,
							arguments: [
								GoAST.createIntegerLiteral({ value: 0n }),
								call(GoAST.createIdentifier("len"), [results]),
							],
						}),
					}),
					GoAST.createRangeStatement({
						binding: GoAST.createRangeDeclaration({
							key: GoAST.createIdentifier("_"),
							value: item,
						}),
						expression: results,
						body: GoAST.createBlockStatement({
							statements: [
								GoAST.createIfStatement({
									condition: GoAST.createUnaryExpression({
										operator: "!",
										operand: isRightCall(item),
									}),
									body: GoAST.createBlockStatement({
										statements: [returnValue(item)],
									}),
								}),
								GoAST.createAssignmentStatement({
									targets: DCommon.cast([values]),
									values: DCommon.cast([
										call(GoAST.createIdentifier("append"), [
											values,
											assertType(
												select(item, eitherFieldIdentifiers.value),
												valueType,
											),
										]),
									]),
								}),
							],
						}),
					}),
					returnValue(localEitherAnyLiteral(
						GoAST.createIdentifier("TagRightSuccess"),
						values,
					)),
				],
			}),
		],
	});
});
