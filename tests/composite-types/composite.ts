import * as DEither from "@duplojs/lang/either";

// tsTypeToGo, phase 3 de D-18 : tableaux, tuples, objets, maps, fonctions, Promise.

export function numbers(values: number[]) {
	return values;
}

export function frozen(values: readonly string[]) {
	return values;
}

export function pair(value: [number, number]) {
	return value;
}

export function mixed(value: [string, number]) {
	return value;
}

export function user(value: {
	name: string;
	age: number;
}) {
	return value;
}

export function nested(value: {
	tags: string[];
	owner: { id: number };
}) {
	return value;
}

export function dictionary(value: Record<string, number>) {
	return value;
}

export function apply(callback: (value: number) => string) {
	return callback(1);
}

export function variadic(callback: (...values: number[]) => void) {
	return callback;
}

export function awaited(value: Promise<number>) {
	return value;
}

export function generic<GenericValue>(value: GenericValue) {
	return value;
}

export function listResult(values: number[]): DEither.Success<number[]> | DEither.Fail {
	return DEither.success(values);
}
