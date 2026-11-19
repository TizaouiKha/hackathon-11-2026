import * as DCommon from "@duplojs/lang/common";

// R-01, n° 2 : JavaScript évalue les opérandes de gauche à droite.
// Un opérande déjà lu ne doit pas voir un changement fait par un opérande suivant.

let shared = 1;
let trace = "";

function change() {
	shared = 10;

	return 0;
}

function pair(first: number, second: number) {
	return [first, second];
}

function log(name: string) {
	trace = `${trace}${name}`;

	return name;
}

function same(value: string) {
	return value;
}

// 1. Arguments d'un appel : `x` est lu avant `change()`.
export function callArguments() {
	shared = 1;

	return pair(shared, change());
}

// 2. Opérateur binaire.
export function binaryOperands() {
	shared = 1;

	return shared + change();
}

// 3. Tableau littéral.
export function arrayElements() {
	shared = 1;

	return [shared, change()];
}

// 4. Objet littéral, y compris la forme courte `{ shared }`.
export function objectValues() {
	shared = 1;

	return {
		first: shared,
		second: change(),
	};
}

export function shorthandValue() {
	shared = 1;

	return {
		shared,
		second: change(),
	};
}

// 5. Ordre des appels dans un objet : `log("a")` avant `log("b")`.
export function objectCallOrder() {
	trace = "";

	const value = {
		first: log("a"),
		second: same(log("b")),
	};

	return `${trace}:${value.first}${value.second}`;
}

// 6. Paramètre modifié par une fonction fléchée.
export function capturedParameter(value: number) {
	const bump = () => {
		// eslint-disable-next-line no-param-reassign -- c'est le cas testé
		value = 5;

		return 0;
	};

	return value + bump();
}

// 7. Une constante n'a pas besoin de copie.
export function constantOperand() {
	const fixed = 3;

	return fixed + change();
}

// 8. Template string.
export function templateParts() {
	shared = 1;

	return `${shared}:${change()}`;
}

export function show(value: unknown) {
	return DCommon.print(value);
}
