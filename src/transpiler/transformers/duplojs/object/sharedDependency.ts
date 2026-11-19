import * as DCommon from "@duplojs/lang/common";
import { GoAST } from "@go";
import { createSharedDependency } from "@transformer";
import { go } from "../../shared/goBuilder";

export const overrideFieldIdentifier = GoAST.createIdentifier("OverrideField");

/**
 * `DObject.override` ignore les valeurs `undefined` (D-24) :
 * ```go
 * func OverrideField[T any](value any, current T) T {
 *     isUndefined := value == nil || value == JSUndefined{}
 *     if isUndefined { return current }
 *     return value.(T)
 * }
 * ```
 * `value` est un champ facultatif (`any` en Go) : TypeScript a vérifié qu'il
 * contient un `T` quand il n'est pas `undefined`.
 */
export const objectDependency = DCommon.memo(() => createSharedDependency({
	imports: [],
	init: [],
	declarations: [
		go.function({
			name: overrideFieldIdentifier.value,
			generic: [["T", go.types.any]],
			parameters: [go.parameter("value", go.types.any), go.parameter("current", go.id("T"))],
			returns: go.id("T"),
			body: [
				go.declare("isUndefined", go.binary(
					go.binary(go.id("value"), "==", go.id("nil")),
					"||",
					go.binary(go.id("value"), "==", go.empty("JSUndefined")),
				)),
				go.when(go.id("isUndefined"), [go.return(go.id("current"))]),
				go.return(go.assert(go.id("value"), go.id("T"))),
			],
		}),
	],
}));
