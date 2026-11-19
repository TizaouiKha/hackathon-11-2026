import * as DCommon from "@duplojs/lang/common";
import type { GoAST } from "@go";
import { type Transformer } from "@transformer";
import { duploJSStatementTransformers } from "../duplojs";
import { sharedStatementTransformers } from "../shared";
import { blockStatementTransformer } from "./block";
import { returnStatementTransformer } from "./return";
import { variableStatementTransformer } from "./variable";
import { ifStatementTransformer } from "./if";
import { assignmentStatementTransformer } from "./assignment";
import { forOfStatementTransformer, forStatementTransformer, jumpStatementTransformer, whileStatementTransformer } from "./loop";
import { switchStatementTransformer } from "./switch";

export const statementTransformers = DCommon.memo(
	(): readonly Transformer<GoAST.Statement>[] => [
		...duploJSStatementTransformers.value,
		assignmentStatementTransformer,
		...sharedStatementTransformers.value,
		blockStatementTransformer,
		variableStatementTransformer,
		ifStatementTransformer,
		returnStatementTransformer,
		forOfStatementTransformer,
		whileStatementTransformer,
		forStatementTransformer,
		jumpStatementTransformer,
		switchStatementTransformer,
	],
);
