import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";

/**
 * Petits constructeurs pour écrire du Go lisible avec l'AST (helpers des shared
 * dependencies et code généré). À utiliser pour tout nouveau helper, plutôt que
 * de réécrire un mini-langage dans chaque fichier.
 */

export type GoTypeNode = GoAST.TypeReference | GoAST.Type;

export const go = {
	id: GoAST.createIdentifier,
	types: GoAST.builtinTypeReferences,

	int(value: number) {
		return GoAST.createIntegerLiteral({ value: BigInt(value) });
	},

	string(value: string) {
		return GoAST.createStringLiteral({ value });
	},

	bool(value: boolean) {
		return GoAST.createBooleanLiteral({ value });
	},

	/** `target.name` */
	select(target: GoAST.Expression | string, name: string) {
		return GoAST.createSelectorExpression({
			target: typeof target === "string" ? GoAST.createIdentifier(target) : target,
			identifier: GoAST.createIdentifier(name),
		});
	},

	/** `callee(arguments…)` ; `callee` peut être un nom ou une expression. */
	call(callee: GoAST.Expression | string, callArguments: readonly GoAST.Expression[] = []) {
		return GoAST.createCallExpression({
			callee: typeof callee === "string" ? GoAST.createIdentifier(callee) : callee,
			arguments: callArguments,
		});
	},

	binary(left: GoAST.Expression, operator: GoAST.BinaryOperator, right: GoAST.Expression) {
		return GoAST.createBinaryExpression({
			left,
			operator,
			right,
		});
	},

	not(operand: GoAST.Expression) {
		return GoAST.createUnaryExpression({
			operator: "!",
			operand,
		});
	},

	convert(typeReference: GoAST.BuiltinTypeReference, operand: GoAST.Expression) {
		return GoAST.createConversionExpression({
			typeReference,
			operand,
		});
	},

	/** `value.(T)` */
	assert(value: GoAST.Expression, type: GoTypeNode) {
		return GoAST.createTypeAssertionExpression({
			target: value,
			typeReference: type,
		});
	},

	index(target: GoAST.Expression, index: GoAST.Expression) {
		return GoAST.createIndexExpression({
			target,
			index,
		});
	},

	/** `T{}` pour une struct sans champ (`JSUndefined{}`). */
	empty(typeName: string) {
		return GoAST.createStructLiteral({
			typeReference: GoAST.createIdentifier(typeName),
			elements: [],
		});
	},

	block(statements: readonly GoAST.Statement[]) {
		return GoAST.createBlockStatement({ statements });
	},

	return(value?: GoAST.Expression) {
		return GoAST.createReturnStatement({ values: value ? DCommon.cast([value]) : [] });
	},

	/** `if condition { … } else { … }` */
	when(condition: GoAST.Expression, statements: readonly GoAST.Statement[], otherwise?: readonly GoAST.Statement[]) {
		return GoAST.createIfStatement({
			condition,
			body: GoAST.createBlockStatement({ statements }),
			elseBranch: otherwise ? GoAST.createBlockStatement({ statements: otherwise }) : undefined,
		});
	},

	/** `name := value` */
	declare(name: string, value: GoAST.Expression) {
		return GoAST.createShortVariableDeclarationStatement({
			identifier: GoAST.createIdentifier(name),
			initializer: value,
		});
	},

	/** `var name T` */
	variable(name: string, type: GoTypeNode) {
		return GoAST.createVariableDeclarationZeroValue({
			identifier: GoAST.createIdentifier(name),
			typeReference: type,
		});
	},

	/** `targets… = values…` */
	assign(targets: readonly GoAST.Expression[], values: readonly GoAST.Expression[]) {
		return GoAST.createAssignmentStatement({
			targets: targets as unknown as GoAST.AssignmentStatement["targets"],
			values: values as unknown as GoAST.AssignmentStatement["values"],
		});
	},

	parameter(name: string, type: GoTypeNode) {
		return GoAST.createFunctionArgument({
			identifier: GoAST.createIdentifier(name),
			type,
		});
	},

	/** Fonction de package, générique ou non. */
	function(params: {
		readonly name: string;
		readonly generic?: readonly (readonly [string, GoTypeNode])[];
		readonly parameters: readonly GoAST.FunctionArgument[];
		readonly variadic?: GoAST.FunctionArgument;
		readonly returns?: GoTypeNode;
		readonly body: readonly GoAST.Statement[];
	}) {
		return GoAST.createFunctionDeclaration({
			identifier: GoAST.createIdentifier(params.name),
			generic: (params.generic ?? []).map(([name, constraint]) => GoAST.createTypeParameter({
				identifier: GoAST.createIdentifier(name),
				constraint: DCommon.cast(constraint),
			})),
			arguments: params.parameters,
			variadicArgument: params.variadic,
			returnTypes: params.returns ? [params.returns] : [],
			body: GoAST.createBlockStatement({ statements: params.body }),
		});
	},
};
