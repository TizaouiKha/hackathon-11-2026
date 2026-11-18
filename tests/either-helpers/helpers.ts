import * as DEither from "@duplojs/lang/either";

// Constructeurs de test : l'étape 6 (if, const) n'existe pas encore.
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

// isRight
export function isRightOf(result: (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
)) {
	return DEither.isRight(result);
}

// whenIsRightOtherwise : `minusOne` ne déclare pas de paramètre (adaptateur Go).
function double(value: number) {
	return value * 2;
}

function minusOne() {
	return 0 - 1;
}

export function rightOrOtherwise(result: (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
)) {
	return DEither.whenIsRightOtherwise(result, double, minusOne);
}

// whenIsRightOtherwise sur un Either2 (valeur de droite d'un autre type).
function one() {
	return 1;
}

export function either2RightOrOtherwise(result: (
	| DEither.Success<DEither.Success<number>>
	| DEither.Left<"negative-operand", number>
)) {
	return DEither.whenIsRightOtherwise(result, one, minusOne);
}

export function either2Left(value: number): (
	| DEither.Success<DEither.Success<number>>
	| DEither.Left<"negative-operand", number>
) {
	return DEither.left("negative-operand", value);
}

export function either2Right(value: number): (
	| DEither.Success<DEither.Success<number>>
	| DEither.Left<"negative-operand", number>
) {
	return DEither.success(DEither.success(value));
}

// matchInformation : un handler par information, `onFail` sans paramètre.
function onSuccess(value: number) {
	return value + 100;
}

function onNegative(value: number) {
	return value - 100;
}

function onFail() {
	return 0;
}

export function match(result: (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
)) {
	return DEither.matchInformation(result, {
		success: onSuccess,
		"negative-operand": onNegative,
		fail: onFail,
	});
}

// rightPipe : s'arrête au premier left.
function halve(value: number): (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
) {
	return DEither.success(value / 2);
}

function reject(value: number): (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
) {
	return DEither.left("negative-operand", value);
}

export function pipeHalveTwice(result: (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
)) {
	return DEither.rightPipe(result, halve, halve);
}

export function pipeRejectThenHalve(result: (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
)) {
	return DEither.rightPipe(result, reject, halve);
}

// whenIsRight (D-16) : renvoie la valeur brute (TagValue) ou l'erreur inchangée.
export function whenRightDouble(result: (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
)) {
	return DEither.whenIsRight(result, double);
}

// Valeur brute d'un autre type que l'erreur : Either2[bool, float64].
function isBig(value: number) {
	return value > 5;
}

export function whenRightIsBig(result: (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
)) {
	return DEither.whenIsRight(result, isBig);
}

// Seul `Fail` à gauche (pas de valeur) : Either[bool].
export function successOrFail(value: number): (
	| DEither.Success<number>
	| DEither.Fail
) {
	return DEither.success(value);
}

export function onlyFail(): (
	| DEither.Success<number>
	| DEither.Fail
) {
	return DEither.fail();
}

export function whenRightIsBigFailOnly(result: (
	| DEither.Success<number>
	| DEither.Fail
)) {
	return DEither.whenIsRight(result, isBig);
}

// isRight d'une valeur brute : faux, comme en DuploJS.
export function isRightOfRaw(result: (
	| DEither.Success<number>
	| DEither.Left<"negative-operand", number>
	| DEither.Fail
)) {
	return DEither.isRight(DEither.whenIsRight(result, double));
}
