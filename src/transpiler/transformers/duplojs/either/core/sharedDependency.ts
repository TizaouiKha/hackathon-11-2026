import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";

/**
 * Représentation Go des `Either` (DECISIONS.md, D-09.1 pour le tag, D-18 pour EitherAny).
 *
 * ```go
 * type EitherTag uint8
 * var eitherTagIsRight [256]bool
 * var eitherTagIsLeft [256]bool
 * var eitherTagInformation [256]string
 * func (tag EitherTag) IsRight() bool
 * func (tag EitherTag) IsLeft() bool // TagValue : ni right ni left
 * func (tag EitherTag) Information() string
 * func (tag EitherTag) String() string
 * // Une seule représentation pour toutes les unions d'Either, quel que soit
 * // le nombre d'issues et le type de leurs valeurs (déjà vérifié par TypeScript).
 * type EitherAny struct { Tag EitherTag; Value any }
 * ```
 *
 * Les constantes de tag et le remplissage des tables sont produits par
 * information, dans `tag.ts`.
 */

export const eitherTagTypeIdentifier = GoAST.createIdentifier("EitherTag");
export const eitherAnyTypeIdentifier = GoAST.createIdentifier("EitherAny");

export const eitherTagIsRightTableIdentifier = GoAST.createIdentifier("eitherTagIsRight");
export const eitherTagIsLeftTableIdentifier = GoAST.createIdentifier("eitherTagIsLeft");
export const eitherTagInformationTableIdentifier = GoAST.createIdentifier("eitherTagInformation");

export const eitherFieldIdentifiers = {
	tag: GoAST.createIdentifier("Tag"),
	value: GoAST.createIdentifier("Value"),
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

export const eitherCoreDependency = DCommon.memo(() => {
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
			createTagTable(eitherTagIsLeftTableIdentifier, GoAST.builtinTypeReferences.bool),
			createTagTable(eitherTagInformationTableIdentifier, GoAST.builtinTypeReferences.string),
			createTagMethod("IsRight", GoAST.builtinTypeReferences.bool, eitherTagIsRightTableIdentifier),
			createTagMethod("IsLeft", GoAST.builtinTypeReferences.bool, eitherTagIsLeftTableIdentifier),
			createTagMethod("Information", GoAST.builtinTypeReferences.string, eitherTagInformationTableIdentifier),
			createTagMethod("String", GoAST.builtinTypeReferences.string, eitherTagInformationTableIdentifier),
			GoAST.createTypeDefinition({
				identifier: eitherAnyTypeIdentifier,
				type: GoAST.createStructType({
					fields: [
						tagField,
						GoAST.createStructField({
							identifier: eitherFieldIdentifiers.value,
							typeReference: GoAST.builtinTypeReferences.any,
						}),
					],
				}),
			}),
		],
	});
});
