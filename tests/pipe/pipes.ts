import * as DEither from "@duplojs/lang/either";
import * as DCommon from "@duplojs/lang/common";

function double(value: number) {
	return value * 2;
}

function addTen(value: number) {
	return value + 10;
}

function minusOne() {
	return 0 - 1;
}

export function successOf(value: number): (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
) {
	return DEither.success(value);
}

export function negativeOf(value: number): (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
) {
	return DEither.left("negative-operand", value);
}

export function failOf(): (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
) {
	return DEither.fail();
}

// pipe de fonctions simples : (value * 2) + 10.
export function plainPipe(value: number) {
	return DCommon.pipe(value, double, addTen);
}

// Projet 03 : forme curryfiée de whenIsRight dans un pipe.
export function pipeWhenIsRight(result: (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
)) {
	return DCommon.pipe(result, DEither.whenIsRight(double));
}

// Projet 05 : whenIsRightOtherwise curryfiée, puis une fonction simple.
export function pipeOtherwise(result: (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
)) {
	return DCommon.pipe(result, DEither.whenIsRightOtherwise(double, minusOne), addTen);
}

// Enchaînement : la valeur brute (TagValue) produite par whenIsRight n'est pas un Right.
export function pipeChain(result: (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
)) {
	return DCommon.pipe(
		result,
		DEither.whenIsRight(double),
		DEither.whenIsRightOtherwise(double, minusOne),
	);
}

// matchInformation curryfiée.
export function pipeMatch(result: (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
)) {
	return DCommon.pipe(
		result,
		DEither.matchInformation({
			success: double,
			"negative-operand": addTen,
			fail: minusOne,
		}),
	);
}
