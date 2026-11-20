import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";

// D-26 : fonctions DCommon de base. Valeurs attendues : celles de Node.

/* eslint-disable typescript/no-inferrable-types -- des `number` quelconques, pas des littéraux */
const five: number = 5;
const one: number = 1;
const letter: string = "b";
const notANumber: number = 0 / 0;
/* eslint-enable typescript/no-inferrable-types */
const letters = ["a", "b", "c"];
let trace = "";

function remember(value: number) {
	trace = `${trace}[${value}]`;

	return value;
}

export function conditionals() {
	return [
		DCommon.when(five, (value) => value > 3, (value) => value * 2),
		DCommon.when(one, (value) => value > 3, (value) => value * 2),
		DCommon.whenNot(one, (value) => value > 3, (value) => value * 2),
		DCommon.pipe(five, DCommon.when((value) => value > 3, (value) => value + 1)),
	];
}

export function otherwise() {
	return [
		DCommon.whenElse(five, (value) => value > 3, () => "big", () => "small"),
		DCommon.whenElse(one, (value) => value > 3, () => "big", () => "small"),
	];
}

export function mixedResult() {
	return DCommon.when(five, (value) => value > 3, (value) => `n=${value}`);
}

export function equality() {
	return [
		DCommon.equal(five, 5),
		DCommon.equal(letter, ["a", "b"]),
		DCommon.equal(notANumber, notANumber),
	];
}

export function equalAsFilter() {
	return DArray.filter(letters, DCommon.equal(["a", "c"]));
}

export function logical() {
	return [
		DCommon.and(five, [(value) => value > 3, (value) => value < 10]),
		DCommon.and(five, [(value) => value > 3, (value) => value < 4]),
		DCommon.or(one, [(value) => value > 3, (value) => value < 2]),
	];
}

export function tapped() {
	trace = "";
	const result = DCommon.tap(five, remember);

	return `${result}:${trace}`;
}

export function truthiness() {
	return [
		DCommon.truthy(0),
		DCommon.truthy(""),
		DCommon.truthy("x"),
		DCommon.falsy(notANumber),
		DCommon.truthy(undefined),
	];
}

export function truthyFilter() {
	return DArray.filter([0, 1, 2, notANumber], DCommon.truthy);
}

export function types() {
	const value: string | number = five > 3 ? "text" : 3;

	return [DCommon.isType(value, "string"), DCommon.isType(value, "number"), DCommon.isType(null, "null")];
}

export function executed() {
	return DCommon.justExec(() => 42);
}

export function constantMap() {
	return DArray.map(letters, DCommon.justReturn(0));
}

export function forwarded() {
	return DCommon.pipe(five, DCommon.forward);
}

export function show(value: unknown) {
	return DCommon.print(value);
}
