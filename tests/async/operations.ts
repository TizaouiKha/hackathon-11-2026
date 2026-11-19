import * as DEither from "@duplojs/lang/either";
import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DString from "@duplojs/lang/string";
import { add } from "./add";
import { divide } from "./divide";

export async function asyncRight(value: number) {
	return DEither.rightAsyncPipe(
		DEither.success(value),
		(current) => DEither.success(current * 2),
	);
}

export async function asyncFailure(divisor: number) {
	return DEither.rightAsyncPipe(
		DEither.success(6),
		(value) => divide(value, divisor),
		(value) => DEither.success(value * 100),
	);
}

// eslint-disable-next-line typescript/require-await
async function identity(value: number) {
	return value;
}

export async function awaitedValue(value: number) {
	// eslint-disable-next-line typescript/return-await
	return await identity(value);
}

// eslint-disable-next-line typescript/require-await
async function asAny(value: string): Promise<any> {
	return value;
}

function consumeText(value: string) {
	return value;
}

export async function awaitedAny() {
	// eslint-disable-next-line typescript/no-unsafe-argument
	return consumeText(await asAny("adapted"));
}

export async function calculate(one: number, two: number, divisor: number) {
	return DEither.rightAsyncPipe(
		add(one, two),
		(value) => divide(value, divisor),
		(value) => DEither.success(value * 2),
	);
}

export function asyncGroup(value: number) {
	return DEither.asyncGroup([
		() => asyncRight(value),
		() => asyncRight(value + 1),
	]);
}

export function rawAsyncRight(value: number) {
	return DEither.rightAsyncPipe(
		value,
		(current) => current + 1,
	);
}

export function directAsyncGroup(value: number) {
	return DEither.asyncGroup([
		DEither.success(value),
		DEither.success(value + 1),
	]);
}

export function storedGetterAsyncGroup(value: number) {
	const entries = [
		() => asyncRight(value),
		() => asyncRight(value + 1),
	];

	return DEither.asyncGroup(entries);
}

export function storedValueAsyncGroup(value: number) {
	const entries = [
		DEither.success(value),
		DEither.success(value + 1),
	];

	return DEither.asyncGroup(entries);
}

export function storedMixedAsyncGroup(value: number) {
	const entries = [
		() => asyncRight(value),
		DEither.success(value + 1),
	];

	return DEither.asyncGroup(entries);
}

export function objectAsyncGroup(value: number) {
	const original = DEither.success(value);

	return DEither.asyncGroup({
		original,
		doubled: () => asyncRight(value),
		label: DEither.success("ready"),
	});
}

export function objectAsyncGroupFailure(divisor: number) {
	return DEither.asyncGroup({
		first: () => asyncRight(1),
		failed: () => asyncFailure(divisor),
		skipped: () => asyncRight(2),
	});
}

export async function asyncPipeline(value: number) {
	const grouped = asyncGroup(value);
	const completed = DCommon.asyncPipe(
		grouped,
		DEither.whenIsRightOtherwise(
			(values) => DArray.map(values, DString.to),
			() => ["failed"],
		),
	);
	// eslint-disable-next-line typescript/return-await
	return await completed;
}

export async function projectPipeline() {
	const calculations = DEither.asyncGroup([
		() => calculate(1, 2, 1),
		() => calculate(4, 5, 3),
		() => calculate(2, 3, 0),
	]);
	const completed = DCommon.asyncPipe(
		calculations,
		DEither.whenIsRightOtherwise(
			(values) => DArray.map(values, DString.to),
			() => ["transaction annulée"],
		),
	);
	// eslint-disable-next-line typescript/return-await
	return await completed;
}
