import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DString from "@duplojs/lang/string";

// Cas de `DArray.map` plus durs que tests/arrays, écrits sans `const` ni
// fonction fléchée (étape 6) : chaque callback est une fonction déclarée.

function double(value: number) {
	return value * 2;
}

function failText() {
	return DString.to(0);
}

function wrapSuccess(value: number) {
	return DEither.success(value);
}

function halve(value: number) {
	return DEither.success(value / 2);
}

function chain(value: number) {
	return DEither.rightPipe(DEither.success(value), halve);
}

function doubleRow(row: number[]) {
	return DArray.map(row, double);
}

function rowTexts(row: readonly number[]) {
	return DArray.map(row, DString.to);
}

function keepUser(user: {
	name: string;
	age: number;
}) {
	return user;
}

function identity<GenericValue>(value: GenericValue): GenericValue {
	return value;
}

function keepRaw(value: string | number) {
	return value;
}

// Constructeurs pour le test Go.
export function makeSuccess(value: number): DEither.Success<number> | DEither.Fail {
	return DEither.success(value);
}

export function makeFail(): DEither.Success<number> | DEither.Fail {
	return DEither.fail();
}

// 1. Second map du projet 08 : un helper Either curryfié comme callback.
export function describeAll(results: (DEither.Success<number> | DEither.Fail)[]) {
	return DArray.map(results, DEither.whenIsRightOtherwise(DString.to, failText));
}

// 2. La même chose dans un pipe, avec map curryfié (forme exacte du projet 08).
export function describeAllPiped(results: (DEither.Success<number> | DEither.Fail)[]) {
	return DCommon.pipe(
		results,
		DArray.map(DEither.whenIsRightOtherwise(DString.to, failText)),
	);
}

// 3. map qui produit des Either.
export function successes(values: number[]) {
	return DArray.map(values, wrapSuccess);
}

// 4. Premier map du projet 08 : un rightPipe dans le callback.
export function chained(values: number[]) {
	return DArray.map(values, chain);
}

// 5. map imbriqués.
export function nested(rows: number[][]) {
	return DArray.map(rows, doubleRow);
}

export function nestedTexts(rows: number[][]) {
	return DArray.map(rows, rowTexts);
}

// 6. Tableau d'objets.
export function users(list: {
	name: string;
	age: number;
}[]) {
	return DArray.map(list, keepUser);
}

// 7. Callback générique.
export function generic(values: number[]) {
	return DArray.map(values, identity);
}

// 8. Tuple hétérogène (`[]any` en Go).
export function mixedTuple(value: [string, number]) {
	return DArray.map(value, keepRaw);
}

// Affichage, comme dans les projets.
export function printValue(value: unknown) {
	return DCommon.print(value);
}
