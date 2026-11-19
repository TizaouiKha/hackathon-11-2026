import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DNumber from "@duplojs/lang/number";

// D-25 : fonctions DNumber, avec les cas limites de JS. Valeurs attendues : Node.

// `: number` exprès : un `number` quelconque, pas le type littéral `5`.
/* eslint-disable typescript/no-inferrable-types */
const five: number = 5;
const three: number = 3;
const notANumber: number = 0 / 0;
const infinity: number = 1 / 0;
const negativeZero: number = -0;
/* eslint-enable typescript/no-inferrable-types */
const list: number[] = [1, 2, 3, 4];

export function comparisons() {
	return [
		DNumber.greaterThan(five, 3),
		DNumber.greaterThanOrEqual(three, 3),
		DNumber.lessThan(five, 3),
		DNumber.lessThanOrEqual(three, 3),
		DNumber.betweenThan(five, 1, 10),
		DNumber.betweenThanOrEqual(three, 3, 10),
	];
}

export function parity() {
	return [
		DNumber.isEven(-4),
		DNumber.isOdd(-3),
		DNumber.isOdd(notANumber),
		DNumber.isEven(2.5),
		DNumber.isMultipleOf(9, 3),
	];
}

export function integers() {
	return [
		DNumber.isInteger(three),
		DNumber.isInteger(3.5),
		DNumber.isInteger(infinity),
		DNumber.isSafe(10),
		DNumber.isSafe(9007199254740992),
	];
}

export function signs() {
	return [
		DNumber.isNegative(0),
		DNumber.isPositive(negativeZero),
		DNumber.isStrictPositive(0),
		DNumber.isStrictNegative(-1),
		DNumber.isNotZero(negativeZero),
	];
}

export function totals() {
	const empty: number[] = [];

	return [DNumber.sum([1, 2, 3.5]), DNumber.sum(empty)];
}

// max / min exigent au moins un élément connu : un tuple.
const highs: readonly [number, number, number] = [1, 5, 3];
const lows: readonly [number, number, number] = [4, 2, 8];
const withNaN: readonly [number, number] = [1, notANumber];

export function extremes() {
	return [
		DNumber.max(highs),
		DNumber.min(lows),
		DNumber.maxOf(highs),
		DNumber.minOf(lows),
		DNumber.max(withNaN),
	];
}

export function sorted() {
	return [
		DNumber.sort([3, 1, 2], "ASC"),
		DCommon.pipe([3, 1, 2], DNumber.sort("DSC")),
	];
}

export function asValues() {
	return [
		DArray.filter(list, DNumber.isEven),
		DArray.filter(list, DNumber.greaterThan(2)),
	];
}

export function show(value: unknown) {
	return DCommon.print(value);
}
