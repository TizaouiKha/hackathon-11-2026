import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DString from "@duplojs/lang/string";

// Étape 8b : DArray.map et DArray.coalescing.

function double(value: number) {
	return value * 2;
}

// map, forme avec données.
export function doubled(values: number[]) {
	return DArray.map(values, double);
}

export function readonlyDoubled(values: readonly number[]) {
	return DArray.map(values, double);
}

// Un callback qui déclare moins de paramètres que `(element, { index, self })`.
export function texts(values: number[]) {
	return DArray.map(values, DString.to);
}

// Un tuple est un tableau : une slice Go.
export function pairTexts(pair: [number, number]) {
	return DArray.map(pair, DString.to);
}

// map, forme curryfiée dans un pipe.
export function curriedTexts(values: number[]) {
	return DCommon.pipe(values, DArray.map(DString.to));
}

// coalescing : une valeur devient `[valeur]`, un tableau reste tel quel.
export function wrapped(value: number) {
	return DArray.coalescing(value);
}

export function kept(values: number[]) {
	return DArray.coalescing(values);
}

export function keptPair(pair: [number, number]) {
	return DArray.coalescing(pair);
}

// Constructeurs pour le test Go (les tags n'existent que s'ils sont utilisés).
export function makeSuccess(value: number): DEither.Success<number> | DEither.Fail {
	return DEither.success(value);
}

export function makeFail(): DEither.Success<number> | DEither.Fail {
	return DEither.fail();
}

// Forme du projet 02 : coalescing passé comme fonction.
export function project02(result: DEither.Success<number> | DEither.Fail) {
	return DEither.whenIsRight(result, DArray.coalescing);
}

function fallback(): readonly number[] {
	return DArray.coalescing(12);
}

// Forme des projets 05 à 07 : `readonly [number] | readonly number[]`, puis map.
export function project05(result: DEither.Success<number> | DEither.Fail) {
	return DCommon.pipe(
		result,
		DEither.whenIsRightOtherwise(DArray.coalescing, fallback),
		DArray.map(DString.to),
	);
}
