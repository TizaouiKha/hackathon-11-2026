import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";

// D-21 : un objet « plus grand » passé là où un type d'objet plus petit est attendu.

interface User {
	id: number;
	name: string;
	email: string;
	isActive: boolean;
}

const user: User = {
	id: 1,
	name: "John Doe",
	email: "",
	isActive: true,
};

function nameOf(arg: { name: string }) {
	return arg.name;
}

// 1. Le cas du prof.
export function professorCase() {
	return nameOf(user);
}

// 2. Objet imbriqué : seul `leader.name` est attendu.
function leaderName(team: { leader: { name: string } }) {
	return team.leader.name;
}

export function nested() {
	const team = {
		size: 3,
		leader: user,
	};

	return leaderName(team);
}

// 3. Tableau d'objets.
function names(people: { name: string }[]) {
	return DArray.map(people, nameOf);
}

export function list() {
	const users: User[] = [
		user,
		{
			id: 2,
			name: "Ada",
			email: "ada@x.io",
			isActive: false,
		},
	];

	return names(users);
}

// 4. Champ facultatif attendu, absent de la source.
function describe(person: {
	name: string;
	nickname?: string;
}) {
	return person;
}

export function optional() {
	return describe(user);
}

// 5. La source n'est évaluée qu'une fois.
let calls = 0;

function makeUser(): User {
	calls++;

	return user;
}

export function evaluatedOnce() {
	calls = 0;
	nameOf(makeUser());

	return calls;
}

// 6. Différence assumée : renvoyé sous le type `{ name }`, l'objet n'a plus que
//    `name` en Go, alors que JS renvoie l'objet complet.
function summary(person: User): { name: string } {
	return person;
}

export function narrowedReturn() {
	return summary(user);
}

export function show(value: unknown) {
	return DCommon.print(value);
}

// 7. Déstructuration : le motif `{ name: label }` n'est pas un type cible.
export function destructured() {
	const { name: label, id } = user;

	return `${label}#${id}`;
}
