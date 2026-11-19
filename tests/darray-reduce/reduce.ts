import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DString from "@duplojs/lang/string";

// D-23 : DArray.reduce et ses outils (next, exit, nextPush). Valeurs attendues : Node.

const numbers = [1, 2, 3, 4];

export function sum() {
	return DArray.reduce(numbers, 0, ({ element, lastValue, next }) => next(lastValue + element));
}

export function sumOfIndexes() {
	return DArray.reduce(numbers, 0, ({ index, lastValue, next }) => next(lastValue + index));
}

export function joined() {
	return DArray.reduce(["a", "b", "c"], "", ({ element, lastValue, next }) => next(`${lastValue}${element}`));
}

export function exitSameType() {
	return DArray.reduce(
		numbers,
		0,
		({ element, lastValue, next, exit }) => element > 2 ? exit(lastValue) : next(lastValue + element),
	);
}

export function exitOtherType() {
	return DArray.reduce(
		numbers,
		0,
		({ element, lastValue, next, exit }) => element > 3 ? exit("stop") : next(lastValue + element),
	);
}

export function pushed() {
	return DArray.reduce(
		numbers,
		DArray.reduceFrom<readonly string[]>([]),
		({ element, lastValue, nextPush }) => nextPush(lastValue, DString.to(element)),
	);
}

export function curried() {
	return DCommon.pipe(
		numbers,
		DArray.reduce(0, ({ element, lastValue, next }) => next((lastValue * 10) + element)),
	);
}

export function notDestructured() {
	return DArray.reduce(numbers, 0, (params) => params.next(params.lastValue + params.element));
}

export function objectAccumulator() {
	return DArray.reduce(
		numbers,
		DArray.reduceFrom({
			count: 0,
			total: 0,
		}),
		({ element, lastValue, next }) => next({
			count: lastValue.count + 1,
			total: lastValue.total + element,
		}),
	);
}

export function blockBody() {
	return DArray.reduce(numbers, 0, ({ element, lastValue, next, exit }) => {
		if (element === 3) {
			return exit(lastValue);
		}

		return next(lastValue + element);
	});
}

export function show(value: unknown) {
	return DCommon.print(value);
}
