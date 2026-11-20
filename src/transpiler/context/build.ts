import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DModeling from "@duplojs/lang/modeling";
import type * as DObject from "@duplojs/lang/object";
import * as DPath from "@duplojs/lang/path";
import * as DString from "@duplojs/lang/string";
import { GoAST } from "@go";
import { TsAST } from "@typescript";
import type { Symbol } from "typescript/async";
import { transform, type Transformer, type TransformerResultNode, type NotfoundTransformer, type TransformationError, type TransformationNotSupported, type TransformationSuccess, type TransformationSuccessPayload, sharedDependencyImportDeclaration, sharedDependencyPackageName, type SharedDependency } from "@transformer";
import type { FileContext } from "./file";
import type { TranspilationContext } from "./transpilation";
import * as DArray from "@duplojs/lang/array";
import { resolveDependencyFile, resolveReferenceModule, type DependencyReference, type DependencyFile, type ModuleReference, type ResolvedModuleReference } from "../resolvedReference";

export type { DependencyReference } from "../resolvedReference";

export interface BuildContext {
	readonly transpilation: TranspilationContext;
	readonly file: FileContext;

	/** Types Go déjà traduits dans ce fichier. Les sondages utilisent un cache séparé. */
	readonly goTypeCache: Map<number, GoAST.TypeReference | GoAST.Type>;
	readonly goTypeProbeCache: Map<number, GoAST.TypeReference | GoAST.Type>;
	transform<
		GenericTransformers extends readonly Transformer[],
	>(
		data: TsAST.Node,
		transformers: GenericTransformers,
	): Promise<
		| TransformationSuccess<TransformerResultNode<DArray.Unwrap<GenericTransformers>>>
		| TransformationError
		| NotfoundTransformer
	>;
	transformPrepared(
		data: TsAST.Node,
		transformers: readonly Transformer<GoAST.Expression>[],
		forceTemporary?: boolean,
	): Promise<
		| {
			before: readonly GoAST.Statement[];
			operand: GoAST.Expression;
		}
		| TransformationError
		| NotfoundTransformer
	>;
	success<GenericGoNode extends GoAST.Node>(
		payload: DObject.PartialKeys<
			TransformationSuccessPayload<GenericGoNode>,
			"before"
		>
	): TransformationSuccess<GenericGoNode>;
	notSupport(): TransformationNotSupported;
	error(node: TsAST.Node, content?: unknown): TransformationError;
	generateIdentifier(): GoAST.Identifier;
	createSourceIdentifier(value: string): GoAST.Identifier;
	createSourcePackageIdentifier(filePath: string & DPath.Absolute): GoAST.Identifier;
	registerSharedDependency(sharedDependency: SharedDependency): GoAST.Identifier;
	resolveDependencyFile(
		reference: DependencyReference | Symbol,
	): Promise<DEither.Maybe<DependencyFile>>;
	resolveReferenceModule(
		reference: ModuleReference,
		moduleName: string,
		entryPattern?: RegExp,
	): Promise<DEither.Maybe<ResolvedModuleReference>>;
	registerDependencyFile(dependencyFile: DependencyFile): GoAST.Identifier;
}

export function createBuildContext(
	transpilation: TranspilationContext,
	file: FileContext,
) {
	const context: BuildContext = {
		transpilation,
		file,
		goTypeCache: new Map(),
		goTypeProbeCache: new Map(),
		transform: (data, transformers) => transform(data, transformers, context),
		transformPrepared: async(data, transformers, forceTemporary = false) => {
			const transformed = DEither.unwrapRight(await context.transform(data, transformers));
			if (DEither.isLeft(transformed)) {
				return transformed;
			}

			const { before, result } = transformed;
			if (
				!forceTemporary
				&& (
					DModeling.hasTagValue(result, [
						"[node]identifier",
						"[node][expression]literal-integer",
						"[node][expression]literal-float",
						"[node][expression]literal-imaginary",
						"[node][expression]literal-rune",
						"[node][expression]literal-string",
						"[node][expression]literal-boolean",
						"[node][expression]literal-nil",
					])
					// Un identifiant importé est rendu en Go sous la forme package.nom.
					|| (TsAST.isIdentifier(data) && DModeling.hasTagValue(result, "[node][expression]selector"))
					// Le transformer numérique conserve le type number avec float64(...).
					|| (DModeling.hasTagValue(result, "[node][expression]conversion")
						&& DModeling.hasTagValue(result.operand, "[node][expression]literal-float"))
				)
			) {
				return {
					before,
					operand: result,
				};
			}

			const identifier = context.generateIdentifier();
			const declaration = GoAST.createShortVariableDeclarationStatement({
				identifier,
				initializer: result,
			});
			return {
				before: DArray.push(before, declaration),
				operand: identifier,
			};
		},
		error: (node, content) => DEither.left("transformation-error", {
			kind: TsAST.SyntaxKind[node.kind],
			parentKind: node.parent ? TsAST.SyntaxKind[node.parent.kind] : undefined,
			text: node.getText(),
			getNode: () => node,
			content,
			filePath: file.currentFilePath,
			projectWorkDirectory: transpilation.projectWorkDirectory,
		}),
		success: (payload) => DEither.right("transformation-success", {
			...payload,
			before: payload.before ?? [],
		}),
		notSupport: () => DEither.left("transformation-not-supported", undefined),
		registerSharedDependency: (sharedDependency) => {
			transpilation.sharedDependencies.add(sharedDependency);
			file.imports.add(sharedDependencyImportDeclaration);

			return sharedDependencyPackageName;
		},
		resolveDependencyFile: (reference) => resolveDependencyFile(reference, context),
		resolveReferenceModule: (reference, moduleName, entryPattern) => resolveReferenceModule(
			reference,
			context,
			moduleName,
			entryPattern,
		),
		registerDependencyFile: ({ filePath }) => {
			file.dependencyFiles.add(filePath);
			return context.createSourcePackageIdentifier(filePath);
		},
		generateIdentifier: () => GoAST.createIdentifier(`Generated_${transpilation.increment()}`),
		createSourceIdentifier: (value) => DCommon.pipe(
			value,
			DString.replace(
				/[^a-zA-Z0-9_]/g,
				({ matchedValue }) => DCommon.pipe(
					matchedValue.charCodeAt(0).toString(36),
					DString.padStart(4, "0"),
				),
			),
			DString.prepend("Sourced_"),
			GoAST.createIdentifier,
		),
		createSourcePackageIdentifier: (filePath) => context.createSourceIdentifier(
			DPath.computeRelative(transpilation.projectWorkDirectory, filePath),
		),
	};

	return context;
}
