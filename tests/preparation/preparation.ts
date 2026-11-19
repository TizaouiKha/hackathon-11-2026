import * as DEither from "@duplojs/lang/either";

function add(left: number, right: number): number {
	return left + right;
}

function subtract(left: number, right: number): number {
	return left - right;
}

export function nested(left: number, right: number): number {
	return subtract(add(left, 1), add(right, 2)) / 2;
}

export function half(): number {
	return 1 / 2;
}

export function divideByZero(value: number): number {
	return value / 0;
}

export function overflow(): number {
	return 1e308 * 1e308;
}

function identity(value: number): number {
	return value;
}

function zero(): number {
	return 0;
}

function matches(result: DEither.Success<number> | DEither.Fail): boolean {
	return DEither.matchInformation(result, {
		success: identity,
		fail: zero,
	}) > 0;
}

export function both(ready: boolean, result: DEither.Success<number> | DEither.Fail): boolean {
	return ready && matches(result);
}

export function either(ready: boolean, result: DEither.Success<number> | DEither.Fail): boolean {
	return ready || matches(result);
}
