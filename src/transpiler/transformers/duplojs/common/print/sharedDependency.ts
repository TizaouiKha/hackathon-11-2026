import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

const identifier = GoAST.createIdentifier;

function selector(target: GoAST.Expression, name: string) {
	return GoAST.createSelectorExpression({
		target,
		identifier: identifier(name),
	});
}

function call(callee: GoAST.Expression, args: readonly GoAST.Expression[]) {
	return GoAST.createCallExpression({
		callee,
		arguments: args,
	});
}

function string(value: string) {
	return GoAST.createStringLiteral({ value });
}

function integer(value: bigint) {
	return GoAST.createIntegerLiteral({ value });
}

function float(value: string) {
	return GoAST.createFloatLiteral({ value });
}

function binary(
	left: GoAST.Expression,
	operator: GoAST.BinaryOperator,
	right: GoAST.Expression,
) {
	return GoAST.createBinaryExpression({
		left,
		operator,
		right,
	});
}

function returnStatement(...values: GoAST.Expression[]) {
	return GoAST.createReturnStatement({ values });
}

function block(...statements: GoAST.Statement[]) {
	return GoAST.createBlockStatement({ statements });
}

function shortDeclaration(name: string, initializer: GoAST.Expression) {
	return GoAST.createShortVariableDeclarationStatement({
		identifier: identifier(name),
		initializer,
	});
}

function assignment(name: string, value: GoAST.Expression) {
	return GoAST.createAssignmentStatement({
		targets: DCommon.cast([identifier(name)]),
		values: DCommon.cast([value]),
	});
}

function append(target: string, ...values: GoAST.Expression[]) {
	return assignment(
		target,
		call(identifier("append"), [identifier(target), ...values]),
	);
}

function ifStatement(
	condition: GoAST.Expression,
	...statements: GoAST.Statement[]
) {
	return GoAST.createIfStatement({
		condition,
		body: block(...statements),
	});
}

function functionArgument(name: string, type: GoAST.FunctionArgumentType) {
	return GoAST.createFunctionArgument({
		identifier: identifier(name),
		type,
	});
}

function packageType(packageName: string, typeName: string) {
	return GoAST.createPackageTypeReference({
		packageName: identifier(packageName),
		identifier: identifier(typeName),
	});
}

function createFunction(
	params: {
		name: string;
		args: readonly GoAST.FunctionArgument[];
		returnTypes: readonly GoAST.FunctionDeclarationReturnType[];
		statements: readonly GoAST.Statement[];
		generic?: readonly GoAST.TypeParameter[];
	},
) {
	return GoAST.createFunctionDeclaration({
		identifier: identifier(params.name),
		generic: params.generic ?? [],
		arguments: params.args,
		returnTypes: params.returnTypes,
		body: GoAST.createBlockStatement({ statements: params.statements }),
	});
}

function emptyStringSlice() {
	return GoAST.createSliceLiteral({
		typeReference: GoAST.createSliceType({
			elementType: GoAST.builtinTypeReferences.string,
		}),
		elements: [],
	});
}

function reflectKind(value: string) {
	return selector(identifier("reflect"), value);
}

function kindIs(value: string, kind: string) {
	return binary(
		call(selector(identifier(value), "Kind"), []),
		"==",
		reflectKind(kind),
	);
}

function quoteStringFunction() {
	const quoted = identifier("quoted");
	const inner = GoAST.createSliceExpression({
		target: quoted,
		low: integer(1n),
		high: binary(
			call(identifier("len"), [quoted]),
			"-",
			integer(1n),
		),
	});
	const unescapedDoubleQuotes = call(
		selector(identifier("strings"), "ReplaceAll"),
		[inner, string("\\\""), string("\"")],
	);
	const hasSingleQuote = call(
		selector(identifier("strings"), "Contains"),
		[identifier("value"), string("'")],
	);
	const hasDoubleQuote = call(
		selector(identifier("strings"), "Contains"),
		[identifier("value"), string("\"")],
	);
	const hasBacktick = call(
		selector(identifier("strings"), "Contains"),
		[identifier("value"), string("`")],
	);
	const escapedSingleQuotes = call(
		selector(identifier("strings"), "ReplaceAll"),
		[unescapedDoubleQuotes, string("'"), string("\\'")],
	);

	return createFunction({
		name: "quoteString",
		args: [functionArgument("value", GoAST.builtinTypeReferences.string)],
		returnTypes: [GoAST.builtinTypeReferences.string],
		statements: [
			shortDeclaration(
				"quoted",
				call(selector(identifier("strconv"), "Quote"), [identifier("value")]),
			),
			ifStatement(
				binary(hasSingleQuote, "==", GoAST.createBooleanLiteral({ value: false })),
				returnStatement(
					binary(
						binary(string("'"), "+", unescapedDoubleQuotes),
						"+",
						string("'"),
					),
				),
			),
			ifStatement(
				binary(hasDoubleQuote, "==", GoAST.createBooleanLiteral({ value: false })),
				returnStatement(quoted),
			),
			ifStatement(
				binary(hasBacktick, "==", GoAST.createBooleanLiteral({ value: false })),
				returnStatement(
					binary(
						binary(string("`"), "+", unescapedDoubleQuotes),
						"+",
						string("`"),
					),
				),
			),
			returnStatement(
				binary(
					binary(string("'"), "+", escapedSingleQuotes),
					"+",
					string("'"),
				),
			),
		],
	});
}

function formatCompositeFunction() {
	const parts = identifier("parts");
	const open = identifier("open");
	const close = identifier("close");
	const depth = identifier("depth");
	const joined = identifier("joined");
	const inline = identifier("inline");
	const indent = identifier("indent");
	const closeIndent = identifier("closeIndent");
	const newlineIndent = binary(string(",\n"), "+", indent);

	return createFunction({
		name: "formatComposite",
		args: [
			functionArgument(
				"parts",
				GoAST.createSliceType({ elementType: GoAST.builtinTypeReferences.string }),
			),
			functionArgument("open", GoAST.builtinTypeReferences.string),
			functionArgument("close", GoAST.builtinTypeReferences.string),
			functionArgument("depth", GoAST.builtinTypeReferences.int),
		],
		returnTypes: [GoAST.builtinTypeReferences.string],
		statements: [
			ifStatement(
				binary(call(identifier("len"), [parts]), "==", integer(0n)),
				returnStatement(binary(open, "+", close)),
			),
			shortDeclaration(
				"joined",
				call(selector(identifier("strings"), "Join"), [parts, string(", ")]),
			),
			shortDeclaration(
				"inline",
				binary(
					binary(binary(open, "+", string(" ")), "+", joined),
					"+",
					binary(string(" "), "+", close),
				),
			),
			ifStatement(
				binary(
					call(selector(identifier("utf8"), "RuneCountInString"), [inline]),
					"<=",
					integer(80n),
				),
				returnStatement(inline),
			),
			shortDeclaration(
				"indent",
				call(
					selector(identifier("strings"), "Repeat"),
					[
						string(" "),
						binary(
							binary(depth, "+", integer(1n)),
							"*",
							integer(2n),
						),
					],
				),
			),
			shortDeclaration(
				"closeIndent",
				call(
					selector(identifier("strings"), "Repeat"),
					[string(" "), binary(depth, "*", integer(2n))],
				),
			),
			returnStatement(
				binary(
					binary(
						binary(
							binary(open, "+", string("\n")),
							"+",
							indent,
						),
						"+",
						call(
							selector(identifier("strings"), "Join"),
							[parts, newlineIndent],
						),
					),
					"+",
					binary(binary(string("\n"), "+", closeIndent), "+", close),
				),
			),
		],
	});
}

function inspectSequenceFunction() {
	const index = identifier("index");
	const parts = identifier("parts");

	return createFunction({
		name: "inspectSequence",
		args: [
			functionArgument("value", packageType("reflect", "Value")),
			functionArgument("depth", GoAST.builtinTypeReferences.int),
		],
		returnTypes: [GoAST.builtinTypeReferences.string],
		statements: [
			shortDeclaration("parts", emptyStringSlice()),
			GoAST.createForStatement({
				initializer: shortDeclaration("index", integer(0n)),
				condition: binary(
					index,
					"<",
					call(selector(identifier("value"), "Len"), []),
				),
				post: GoAST.createCompoundAssignmentStatement({
					target: index,
					operator: "+=",
					value: integer(1n),
				}),
				body: block(
					append(
						"parts",
						call(
							identifier("inspectValue"),
							[
								call(selector(identifier("value"), "Index"), [index]),
								GoAST.createBooleanLiteral({ value: false }),
								binary(identifier("depth"), "+", integer(1n)),
							],
						),
					),
				),
			}),
			returnStatement(
				call(
					identifier("formatComposite"),
					[parts, string("["), string("]"), identifier("depth")],
				),
			),
		],
	});
}

function formatNumberFunction() {
	const number = identifier("number");
	const parts = identifier("parts");
	const exponent = identifier("exponent");
	const sign = identifier("sign");
	const digits = identifier("digits");

	return createFunction({
		name: "formatNumber",
		args: [functionArgument("number", GoAST.builtinTypeReferences.float64)],
		returnTypes: [GoAST.builtinTypeReferences.string],
		statements: [
			ifStatement(
				call(selector(identifier("math"), "IsNaN"), [number]),
				returnStatement(string("NaN")),
			),
			ifStatement(
				call(selector(identifier("math"), "IsInf"), [number, integer(1n)]),
				returnStatement(string("Infinity")),
			),
			ifStatement(
				call(selector(identifier("math"), "IsInf"), [number, integer(-1n)]),
				returnStatement(string("-Infinity")),
			),
			ifStatement(
				binary(
					call(selector(identifier("math"), "Signbit"), [number]),
					"&&",
					binary(number, "==", integer(0n)),
				),
				returnStatement(string("-0")),
			),
			shortDeclaration("absolute", call(selector(identifier("math"), "Abs"), [number])),
			ifStatement(
				binary(
					binary(identifier("absolute"), ">=", float("1e21")),
					"||",
					binary(
						binary(identifier("absolute"), "!=", integer(0n)),
						"&&",
						binary(identifier("absolute"), "<", float("1e-6")),
					),
				),
				shortDeclaration(
					"scientific",
					call(
						selector(identifier("strconv"), "FormatFloat"),
						[
							number,
							GoAST.createRuneLiteral({ value: "e" }),
							integer(-1n),
							integer(64n),
						],
					),
				),
				shortDeclaration(
					"parts",
					call(
						selector(identifier("strings"), "Split"),
						[identifier("scientific"), string("e")],
					),
				),
				shortDeclaration(
					"exponent",
					GoAST.createIndexExpression({
						target: parts,
						index: integer(1n),
					}),
				),
				shortDeclaration("sign", string("+")),
				GoAST.createIfStatement({
					condition: call(
						selector(identifier("strings"), "HasPrefix"),
						[exponent, string("-")],
					),
					body: block(assignment("sign", string("-"))),
				}),
				shortDeclaration(
					"digits",
					call(
						selector(identifier("strings"), "TrimLeft"),
						[
							call(
								selector(identifier("strings"), "TrimPrefix"),
								[
									call(
										selector(identifier("strings"), "TrimPrefix"),
										[exponent, string("-")],
									),
									string("+"),
								],
							),
							string("0"),
						],
					),
				),
				GoAST.createIfStatement({
					condition: binary(digits, "==", string("")),
					body: block(assignment("digits", string("0"))),
				}),
				returnStatement(
					binary(
						binary(
							binary(
								GoAST.createIndexExpression({
									target: parts,
									index: integer(0n),
								}),
								"+",
								string("e"),
							),
							"+",
							sign,
						),
						"+",
						digits,
					),
				),
			),
			returnStatement(
				call(
					selector(identifier("strconv"), "FormatFloat"),
					[
						number,
						GoAST.createRuneLiteral({ value: "f" }),
						integer(-1n),
						integer(64n),
					],
				),
			),
		],
	});
}

function inspectEitherFunction() {
	const tag = identifier("tag");
	const isRightMethod = identifier("isRightMethod");
	const informationMethod = identifier("informationMethod");
	const right = identifier("right");
	const information = identifier("information");
	const payload = identifier("payload");
	const side = identifier("side");
	const payloadText = identifier("payloadText");
	const parts = identifier("parts");

	return createFunction({
		name: "inspectEither",
		args: [
			functionArgument("value", packageType("reflect", "Value")),
			functionArgument("depth", GoAST.builtinTypeReferences.int),
		],
		returnTypes: [GoAST.builtinTypeReferences.string],
		statements: [
			shortDeclaration("tag", call(selector(identifier("value"), "FieldByName"), [string("Tag")])),
			ifStatement(
				binary(call(selector(tag, "IsValid"), []), "==", GoAST.createBooleanLiteral({ value: false })),
				returnStatement(string("")),
			),
			shortDeclaration("isRightMethod", call(selector(tag, "MethodByName"), [string("IsRight")])),
			shortDeclaration("informationMethod", call(selector(tag, "MethodByName"), [string("Information")])),
			ifStatement(
				binary(
					binary(call(selector(isRightMethod, "IsValid"), []), "==", GoAST.createBooleanLiteral({ value: false })),
					"||",
					binary(
						call(selector(informationMethod, "IsValid"), []),
						"==",
						GoAST.createBooleanLiteral({ value: false }),
					),
				),
				returnStatement(string("")),
			),
			shortDeclaration(
				"right",
				call(
					selector(
						GoAST.createIndexExpression({
							target: call(selector(isRightMethod, "Call"), [GoAST.createNilLiteral({})]),
							index: integer(0n),
						}),
						"Bool",
					),
					[],
				),
			),
			shortDeclaration(
				"information",
				call(
					selector(
						GoAST.createIndexExpression({
							target: call(selector(informationMethod, "Call"), [GoAST.createNilLiteral({})]),
							index: integer(0n),
						}),
						"String",
					),
					[],
				),
			),
			shortDeclaration("side", string("left")),
			GoAST.createIfStatement({
				condition: right,
				body: block(assignment("side", string("right"))),
			}),
			shortDeclaration(
				"payload",
				call(selector(identifier("value"), "FieldByName"), [string("Value")]),
			),
			ifStatement(
				binary(call(selector(payload, "IsValid"), []), "==", GoAST.createBooleanLiteral({ value: false })),
				GoAST.createIfStatement({
					condition: right,
					body: block(assignment(
						"payload",
						call(selector(identifier("value"), "FieldByName"), [string("Right")]),
					)),
					elseBranch: block(assignment(
						"payload",
						call(selector(identifier("value"), "FieldByName"), [string("Left")]),
					)),
				}),
			),
			GoAST.createIfStatement({
				condition: binary(information, "==", string("value")),
				body: block(
					shortDeclaration(
						"rawPayload",
						call(selector(identifier("value"), "FieldByName"), [string("Value")]),
					),
					ifStatement(
						binary(
							call(selector(identifier("rawPayload"), "IsValid"), []),
							"==",
							GoAST.createBooleanLiteral({ value: false }),
						),
						assignment(
							"rawPayload",
							call(selector(identifier("value"), "FieldByName"), [string("Right")]),
						),
					),
					returnStatement(
						call(
							identifier("inspectValue"),
							[
								identifier("rawPayload"),
								GoAST.createBooleanLiteral({ value: true }),
								identifier("depth"),
							],
						),
					),
				),
			}),
			shortDeclaration("parts", emptyStringSlice()),
			append(
				"parts",
				binary(
					call(
						identifier("quoteString"),
						[binary(string("@duplojs/lang/kind/@DuplojsLangEither/"), "+", side)],
					),
					"+",
					string(": null"),
				),
			),
			append(
				"parts",
				binary(
					call(
						identifier("quoteString"),
						[string("@duplojs/lang/kind/@DuplojsLangEither/information")],
					),
					"+",
					binary(string(": "), "+", call(identifier("quoteString"), [information])),
				),
			),
			shortDeclaration(
				"payloadText",
				call(
					identifier("inspectValue"),
					[
						payload,
						GoAST.createBooleanLiteral({ value: false }),
						binary(identifier("depth"), "+", integer(1n)),
					],
				),
			),
			GoAST.createIfStatement({
				condition: binary(information, "==", string("fail")),
				body: block(assignment("payloadText", string("undefined"))),
			}),
			append(
				"parts",
				binary(
					call(
						identifier("quoteString"),
						[string("@duplojs/lang/kind/@DuplojsLangEither/value")],
					),
					"+",
					binary(string(": "), "+", payloadText),
				),
			),
			append(
				"parts",
				binary(
					call(
						identifier("quoteString"),
						[
							binary(
								string("@duplojs/lang/kind/@DuplojsLangEither/"),
								"+",
								information,
							),
						],
					),
					"+",
					string(": null"),
				),
			),
			returnStatement(
				call(
					identifier("formatComposite"),
					[parts, string("{"), string("}"), identifier("depth")],
				),
			),
		],
	});
}

function formatObjectKeyFunction() {
	return createFunction({
		name: "formatObjectKey",
		args: [functionArgument("key", GoAST.builtinTypeReferences.string)],
		returnTypes: [GoAST.builtinTypeReferences.string],
		statements: [
			ifStatement(
				call(
					selector(
						call(
							selector(identifier("regexp"), "MustCompile"),
							[string("^[A-Za-z_][A-Za-z0-9_]*$")],
						),
						"MatchString",
					),
					[identifier("key")],
				),
				returnStatement(identifier("key")),
			),
			returnStatement(call(identifier("quoteString"), [identifier("key")])),
		],
	});
}

function inspectStructFunction() {
	const index = identifier("index");
	const fieldType = selector(
		call(selector(identifier("value"), "Type"), []),
		"Field",
	);
	const key = identifier("key");
	const parts = identifier("parts");

	return createFunction({
		name: "inspectStruct",
		args: [
			functionArgument("value", packageType("reflect", "Value")),
			functionArgument("depth", GoAST.builtinTypeReferences.int),
		],
		returnTypes: [GoAST.builtinTypeReferences.string],
		statements: [
			shortDeclaration("parts", emptyStringSlice()),
			GoAST.createForStatement({
				initializer: shortDeclaration("index", integer(0n)),
				condition: binary(
					index,
					"<",
					call(selector(identifier("value"), "NumField"), []),
				),
				post: GoAST.createCompoundAssignmentStatement({
					target: index,
					operator: "+=",
					value: integer(1n),
				}),
				body: block(
					shortDeclaration("field", call(
						selector(identifier("value"), "Field"),
						[index],
					)),
					ifStatement(
						binary(
							call(selector(identifier("field"), "CanInterface"), []),
							"==",
							GoAST.createBooleanLiteral({ value: false }),
						),
						GoAST.createContinueStatement({}),
					),
					shortDeclaration(
						"fieldType",
						call(fieldType, [index]),
					),
					shortDeclaration(
						"key",
						call(
							selector(selector(identifier("fieldType"), "Tag"), "Get"),
							[string("json")],
						),
					),
					shortDeclaration(
						"keyParts",
						call(
							selector(identifier("strings"), "Split"),
							[key, string(",")],
						),
					),
					assignment(
						"key",
						GoAST.createIndexExpression({
							target: identifier("keyParts"),
							index: integer(0n),
						}),
					),
					ifStatement(
						binary(key, "==", string("-")),
						GoAST.createContinueStatement({}),
					),
					GoAST.createIfStatement({
						condition: binary(key, "==", string("")),
						body: block(assignment("key", selector(identifier("fieldType"), "Name"))),
					}),
					append(
						"parts",
						binary(
							binary(call(identifier("formatObjectKey"), [key]), "+", string(": ")),
							"+",
							call(
								identifier("inspectValue"),
								[
									identifier("field"),
									GoAST.createBooleanLiteral({ value: false }),
									binary(identifier("depth"), "+", integer(1n)),
								],
							),
						),
					),
				),
			}),
			returnStatement(
				call(
					identifier("formatComposite"),
					[parts, string("{"), string("}"), identifier("depth")],
				),
			),
		],
	});
}

function inspectValueFunction() {
	const value = identifier("value");
	const kind = call(selector(value, "Kind"), []);

	const signedInteger = binary(
		binary(kind, ">=", reflectKind("Int")),
		"&&",
		binary(kind, "<=", reflectKind("Int64")),
	);
	const unsignedInteger = binary(
		binary(kind, ">=", reflectKind("Uint")),
		"&&",
		binary(kind, "<=", reflectKind("Uintptr")),
	);
	const isFloat = binary(
		kindIs("value", "Float32"),
		"||",
		kindIs("value", "Float64"),
	);
	const isSequence = binary(
		kindIs("value", "Slice"),
		"||",
		kindIs("value", "Array"),
	);
	const isPointerLike = binary(
		kindIs("value", "Interface"),
		"||",
		kindIs("value", "Ptr"),
	);

	return createFunction({
		name: "inspectValue",
		args: [
			functionArgument("value", packageType("reflect", "Value")),
			functionArgument("top", GoAST.builtinTypeReferences.bool),
			functionArgument("depth", GoAST.builtinTypeReferences.int),
		],
		returnTypes: [GoAST.builtinTypeReferences.string],
		statements: [
			ifStatement(
				binary(call(selector(value, "IsValid"), []), "==", GoAST.createBooleanLiteral({ value: false })),
				returnStatement(string("undefined")),
			),
			shortDeclaration(
				"typeName",
				call(
					selector(call(selector(value, "Type"), []), "Name"),
					[],
				),
			),
			ifStatement(
				binary(identifier("typeName"), "==", string("JSUndefined")),
				returnStatement(string("undefined")),
			),
			ifStatement(
				binary(identifier("typeName"), "==", string("JSNull")),
				returnStatement(string("null")),
			),
			ifStatement(
				isPointerLike,
				GoAST.createIfStatement({
					condition: call(selector(value, "IsNil"), []),
					body: block(returnStatement(string("null"))),
				}),
				returnStatement(
					call(
						identifier("inspectValue"),
						[
							call(selector(value, "Elem"), []),
							identifier("top"),
							identifier("depth"),
						],
					),
				),
			),
			ifStatement(
				kindIs("value", "String"),
				GoAST.createIfStatement({
					condition: identifier("top"),
					body: block(returnStatement(call(selector(value, "String"), []))),
				}),
				returnStatement(call(identifier("quoteString"), [call(selector(value, "String"), [])])),
			),
			ifStatement(
				kindIs("value", "Bool"),
				returnStatement(
					call(selector(identifier("strconv"), "FormatBool"), [call(selector(value, "Bool"), [])]),
				),
			),
			ifStatement(
				signedInteger,
				returnStatement(
					call(
						selector(identifier("strconv"), "FormatInt"),
						[call(selector(value, "Int"), []), integer(10n)],
					),
				),
			),
			ifStatement(
				unsignedInteger,
				returnStatement(
					call(
						selector(identifier("strconv"), "FormatUint"),
						[call(selector(value, "Uint"), []), integer(10n)],
					),
				),
			),
			ifStatement(
				isFloat,
				returnStatement(
					call(identifier("formatNumber"), [call(selector(value, "Float"), [])]),
				),
			),
			ifStatement(
				isSequence,
				returnStatement(
					call(identifier("inspectSequence"), [value, identifier("depth")]),
				),
			),
			ifStatement(
				kindIs("value", "Struct"),
				shortDeclaration(
					"eitherText",
					call(identifier("inspectEither"), [value, identifier("depth")]),
				),
				GoAST.createIfStatement({
					condition: binary(identifier("eitherText"), "!=", string("")),
					body: block(returnStatement(identifier("eitherText"))),
				}),
				returnStatement(call(identifier("inspectStruct"), [value, identifier("depth")])),
			),
			returnStatement(
				call(
					selector(identifier("fmt"), "Sprint"),
					[call(selector(value, "Interface"), [])],
				),
			),
		],
	});
}

function inspectFunction() {
	return createFunction({
		name: "Inspect",
		args: [functionArgument("input", GoAST.builtinTypeReferences.any)],
		returnTypes: [GoAST.builtinTypeReferences.string],
		statements: [
			returnStatement(
				call(
					identifier("inspectValue"),
					[
						call(selector(identifier("reflect"), "ValueOf"), [identifier("input")]),
						GoAST.createBooleanLiteral({ value: true }),
						integer(0n),
					],
				),
			),
		],
	});
}

function printFunction() {
	const inputType = identifier("T");

	return createFunction({
		name: "Print",
		generic: [
			GoAST.createTypeParameter({
				identifier: inputType,
				constraint: GoAST.builtinTypeReferences.any,
			}),
		],
		args: [functionArgument("input", inputType)],
		returnTypes: [inputType],
		statements: [
			GoAST.createCallExpression({
				callee: selector(identifier("fmt"), "Println"),
				arguments: [
					GoAST.createCallExpression({
						callee: identifier("Inspect"),
						arguments: [identifier("input")],
					}),
				],
			}),
			returnStatement(identifier("input")),
		],
	});
}

export const printSharedDependency = DCommon.memo(
	() => createSharedDependency({
		imports: [
			GoAST.createImportDeclaration({ path: "fmt" }),
			GoAST.createImportDeclaration({ path: "math" }),
			GoAST.createImportDeclaration({ path: "reflect" }),
			GoAST.createImportDeclaration({ path: "regexp" }),
			GoAST.createImportDeclaration({ path: "strconv" }),
			GoAST.createImportDeclaration({ path: "strings" }),
			GoAST.createImportDeclaration({ path: "unicode/utf8" }),
		],
		init: [],
		declarations: [
			inspectFunction(),
			printFunction(),
			quoteStringFunction(),
			formatCompositeFunction(),
			formatNumberFunction(),
			inspectSequenceFunction(),
			inspectEitherFunction(),
			formatObjectKeyFunction(),
			inspectStructFunction(),
			inspectValueFunction(),
		],
	}),
);
