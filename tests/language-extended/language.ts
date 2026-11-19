import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DString from "@duplojs/lang/string";

// Constructions courantes absentes des exercices (D-19) : propriétés, éléments,
// objets, affectations, boucles, switch, types locaux.

// --- Propriétés et objets
export function userAge(name: string, age: number) {
	const user = {
		name,
		age,
	};

	return user.age + 1;
}

export function leaderName(name: string) {
	const team = { leader: { name } };

	return team.leader.name;
}

export function describeUser(name: string, age: number) {
	return {
		name,
		age,
		adult: age >= 18,
	};
}

export function arrayLength(values: number[]) {
	return values.length;
}

export function textLength(text: string) {
	return text.length;
}

// --- Éléments
export function first(values: number[]) {
	return values[0];
}

export function pairSecond(label: string, amount: number) {
	const pair: [string, number] = [label, amount];

	return pair[1];
}

export function score(key: string) {
	const scores: Record<string, number> = {
		ada: 36,
		bob: 7,
	};

	return scores[key];
}

export function setFirst(values: number[]) {
	values[0] = 42;

	return values;
}

// --- Affectations et boucles
export function sum(values: number[]) {
	let total = 0;

	for (const value of values) {
		total += value;
	}

	return total;
}

export function countdown(start: number) {
	let text = "";
	let current = start;

	while (current > 0) {
		text += DString.to(current);
		current--;
	}

	return text;
}

export function skipAndStop(limit: number) {
	let total = 0;

	for (let index = 0; index < limit; index++) {
		if (index === 2) {
			continue;
		}

		if (index > 5) {
			break;
		}

		total = total + index;
	}

	return total;
}

// `for…of` sur une chaîne parcourt des caractères (points de code), pas des unités UTF-16.
export function characters(text: string) {
	let count = 0;

	for (const character of text) {
		count++;
		DString.length(character);
	}

	return count;
}

// --- switch
export function grade(value: number) {
	switch (value) {
		case 1:
		case 2:
			return "low";
		case 3:
			return "mid";
		default:
			return "high";
	}
}

// Sans `break`, JS enchaîne sur le `case` suivant.
export function fallThrough(kind: string) {
	let text = "";

	switch (kind) {
		case "a":
			text += "a";
		// Voulu : on teste l'enchaînement sans `break`.
		// eslint-disable-next-line no-fallthrough
		case "b":
			text += "b";
			break;
		default:
			text += "d";
	}

	return text;
}

// --- Type déclaré dans une fonction
export function localType(value: number) {
	type Local = number;
	const local: Local = value;

	return local * 2;
}

export function show(value: unknown) {
	return DCommon.print(value);
}

// --- Template strings, typeof, ??
export function sentence(name: string, age: number, adult: boolean) {
	return `${name} a ${age} ans (${adult})`;
}

export function listText(values: number[]) {
	// Voulu : on teste `String(tableau)` de JS ("1,2.5,-3").
	// eslint-disable-next-line typescript/restrict-template-expressions
	return `[${values}]`;
}

export function lengthOf(value: string | number) {
	if (typeof value === "string") {
		return DString.length(value);
	}

	return value;
}

export function kindOf(value: string | number | boolean) {
	return typeof value;
}

export function orDefault(name: string | undefined) {
	return name ?? "anonyme";
}

// --- Math
export function rounding(value: number) {
	return Math.round(value);
}

export function largest(first: number, second: number, third: number) {
	return Math.max(first, second, third);
}

export function signOf(value: number) {
	return Math.sign(value);
}

export function circleArea(radius: number) {
	return Math.floor(Math.PI * radius * radius);
}

// --- Narrowing après `isLeft` (D-18.2) : `result` est un EitherAny en Go,
// lu comme `number` après le `if`.
function parse(value: number): number | DEither.Fail {
	if (value < 0) {
		return DEither.fail();
	}

	return value;
}

export function narrowed(value: number) {
	const result = parse(value);

	if (DEither.isLeft(result)) {
		return -1;
	}

	return result + 1;
}

// --- Déstructuration
export function indexed(values: number[]) {
	return DArray.map(values, (value, { index }) => value + index);
}

export function selfLength(values: number[]) {
	return DArray.map(values, (_value, { self }) => self.length);
}

export function swap(first: number, second: number) {
	const pair: [number, number] = [first, second];
	const [left, right] = pair;

	return [right, left];
}

export function userLabel(name: string, age: number) {
	const user = {
		name,
		age,
	};
	const { name: label, age: years } = user;

	return `${label}:${years}`;
}

// --- group sur un objet : premier échec, fonctions appelées seulement à leur tour
function check(value: number) {
	if (value < 0) {
		return DEither.left("negative", value);
	}

	return DEither.success(value);
}

let thunkCalls = 0;

function counted(value: number) {
	thunkCalls++;

	return check(value);
}

export function groupBoth(first: number, second: number) {
	return DEither.group({
		first: check(first),
		second: check(second),
	});
}

export function lazyCalls(first: number, second: number) {
	thunkCalls = 0;
	const grouped = DEither.group({
		first: check(first),
		second: () => counted(second),
	});

	return [thunkCalls, DEither.isRight(grouped) ? 1 : 0];
}
