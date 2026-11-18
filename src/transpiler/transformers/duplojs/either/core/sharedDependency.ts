import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

/**
 * Représentation Go des `Either` (DECISIONS.md, D-09).
 *
 * ```go
 * type EitherTag uint8
 * var eitherTagIsRight [256]bool
 * var eitherTagInformation [256]string
 * func (tag EitherTag) IsRight() bool
 * func (tag EitherTag) Information() string
 * func (tag EitherTag) String() string
 * type Either[T any] struct { Tag EitherTag; Value T }
 * type Either2[R any, L any] struct { Tag EitherTag; Right R; Left L }
 * ```
 *
 * Les constantes de tag et le remplissage des tables sont produits par
 * information, dans `tag.ts`.
 */

export const eitherTagTypeIdentifier = GoAST.createIdentifier("EitherTag");
export const eitherTypeIdentifier = GoAST.createIdentifier("Either");
export const either2TypeIdentifier = GoAST.createIdentifier("Either2");

export const eitherTagIsRightTableIdentifier = GoAST.createIdentifier("eitherTagIsRight");
export const eitherTagInformationTableIdentifier = GoAST.createIdentifier("eitherTagInformation");

export const eitherFieldIdentifiers = {
	tag: GoAST.createIdentifier("Tag"),
	value: GoAST.createIdentifier("Value"),
	right: GoAST.createIdentifier("Right"),
	left: GoAST.createIdentifier("Left"),
} as const;

const tagTableLength = GoAST.createIntegerLiteral({ value: 256n });

function createTagTable(
	identifier: GoAST.Identifier,
	elementType: GoAST.BuiltinTypeReference,
) {
	return GoAST.createVariableDeclarationZeroValue({
		identifier,
		typeReference: GoAST.createArrayType({
			length: tagTableLength,
			elementType,
		}),
	});
}

function createTagMethod(
	name: string,
	returnType: GoAST.BuiltinTypeReference,
	table: GoAST.Identifier,
) {
	const receiver = GoAST.createIdentifier("tag");

	return GoAST.createMethodDeclaration({
		identifier: GoAST.createIdentifier(name),
		receiver: [receiver, eitherTagTypeIdentifier],
		generic: [],
		arguments: [],
		returnTypes: [returnType],
		body: GoAST.createBlockStatement({
			statements: [
				GoAST.createReturnStatement({
					values: [
						GoAST.createIndexExpression({
							target: table,
							index: receiver,
						}),
					],
				}),
			],
		}),
	});
}

function createAnyTypeParameter(name: string) {
	return GoAST.createTypeParameter({
		identifier: GoAST.createIdentifier(name),
		constraint: GoAST.builtinTypeReferences.any,
	});
}

export const eitherCoreDependency = DCommon.memo(() => {
	const valueParameter = createAnyTypeParameter("T");
	const rightParameter = createAnyTypeParameter("R");
	const leftParameter = createAnyTypeParameter("L");

	const tagField = GoAST.createStructField({
		identifier: eitherFieldIdentifiers.tag,
		typeReference: eitherTagTypeIdentifier,
	});

	return createSharedDependency({
		imports: [],
		init: [],
		declarations: [
			GoAST.createTypeDefinition({
				identifier: eitherTagTypeIdentifier,
				type: GoAST.builtinTypeReferences.uint8,
			}),
			createTagTable(eitherTagIsRightTableIdentifier, GoAST.builtinTypeReferences.bool),
			createTagTable(eitherTagInformationTableIdentifier, GoAST.builtinTypeReferences.string),
			createTagMethod("IsRight", GoAST.builtinTypeReferences.bool, eitherTagIsRightTableIdentifier),
			createTagMethod("Information", GoAST.builtinTypeReferences.string, eitherTagInformationTableIdentifier),
			createTagMethod("String", GoAST.builtinTypeReferences.string, eitherTagInformationTableIdentifier),
			GoAST.createTypeDefinition({
				identifier: eitherTypeIdentifier,
				generic: [valueParameter],
				type: GoAST.createStructType({
					fields: [
						tagField,
						GoAST.createStructField({
							identifier: eitherFieldIdentifiers.value,
							typeReference: valueParameter.identifier,
						}),
					],
				}),
			}),
			GoAST.createTypeDefinition({
				identifier: either2TypeIdentifier,
				generic: [rightParameter, leftParameter],
				type: GoAST.createStructType({
					fields: [
						tagField,
						GoAST.createStructField({
							identifier: eitherFieldIdentifiers.right,
							typeReference: rightParameter.identifier,
						}),
						GoAST.createStructField({
							identifier: eitherFieldIdentifiers.left,
							typeReference: leftParameter.identifier,
						}),
					],
				}),
			}),
		],
	});
});
