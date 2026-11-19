import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";

// Lot DArray de l'étape 12 : filter, find, findIndex, some, every, includes,
// push, concat, length. Valeurs attendues : celles de Node.

const numbers = [1, 2, 3, 4];

interface User {
	name: string;
	isActive: boolean;
}

const users: User[] = [
	{
		name: "Ada",
		isActive: true,
	},
	{
		name: "Bob",
		isActive: false,
	},
	{
		name: "Cy",
		isActive: true,
	},
];

export function filterEven() {
	return DArray.filter(numbers, (value) => value % 2 === 0);
}

export function filterWithIndex() {
	return DArray.filter(numbers, (_value, params) => params.index > 1);
}

export function filterCurried() {
	return DCommon.pipe(numbers, DArray.filter((value) => value > 2));
}

export function activeNames() {
	return DCommon.pipe(
		users,
		DArray.filter((user) => user.isActive),
		DArray.map((user) => user.name),
	);
}

export function findFound() {
	return DArray.find(numbers, (value) => value > 2);
}

export function findMissing() {
	return DArray.find(numbers, (value) => value > 10);
}

export function findUser() {
	return DArray.find(users, (user) => user.name === "Bob");
}

export function findIndexFound() {
	return DArray.findIndex(numbers, (value) => value === 3);
}

export function findIndexMissing() {
	return DArray.findIndex(numbers, (value) => value === 30);
}

export function someAndEvery() {
	return [
		DArray.some(numbers, (value) => value > 3),
		DArray.some(numbers, (value) => value > 4),
		DArray.every(numbers, (value) => value > 0),
		DArray.every(numbers, (value) => value > 1),
	];
}

export function includesValues() {
	const notANumber = 0 / 0;

	return [
		DArray.includes(numbers, 3),
		DArray.includes(numbers, 5),
		DArray.includes([1, notANumber], notANumber),
		DArray.includes(["a", "b"], "b"),
		DCommon.pipe(numbers, DArray.includes(4)),
	];
}

export function pushCopies() {
	const pushed = DArray.push(numbers, 5, 6);

	return [numbers, pushed];
}

export function concatLists() {
	return DArray.concat([1, 2], [3], [4, 5]);
}

export function lengths() {
	return [DArray.length(numbers), DCommon.pipe(users, DArray.length)];
}

export function show(value: unknown) {
	return DCommon.print(value);
}
