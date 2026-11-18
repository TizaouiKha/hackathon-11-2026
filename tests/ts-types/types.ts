import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import type * as DNumber from "@duplojs/lang/number";

// tsTypeToGo, phase 1 de D-18 : types primitifs et EitherAny.

export function brandedNumber(value: number & DNumber.Positive) {
	return value;
}

export function literalUnion(kind: "a" | "b") {
	return kind;
}

export function flag(value: boolean) {
	return value;
}

export function nothing(value: null) {
	return value;
}

export function missing(value: undefined) {
	return value;
}

export function rawUnion(value: string | number) {
	return value;
}

// Les issues du code du prof : trois valeurs de types différents dans la même union.
export function mustNotContainNumber(): (
	| DEither.Left<"must-be-not-contain-number", undefined>
	| DEither.Error<null>
	| DEither.Success<number & DNumber.Positive>
) {
	return DEither.left("must-be-not-contain-number");
}

export function errorNull(): (
	| DEither.Left<"must-be-not-contain-number", undefined>
	| DEither.Error<null>
	| DEither.Success<number & DNumber.Positive>
) {
	return DEither.error(null);
}

export function positiveLength(length: number & DNumber.Positive): (
	| DEither.Left<"must-be-not-contain-number", undefined>
	| DEither.Error<null>
	| DEither.Success<number & DNumber.Positive>
) {
	return DEither.success(length);
}

export function validUsername(username: string): (
	| DEither.Right<"valid-username", string>
	| DEither.Error<null>
) {
	return DEither.right("valid-username", username);
}

// Utilise print, pour que Inspect soit généré dans shard_dependencies.
export function show(value: number) {
	return DCommon.print(value);
}
