import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";

// D-27 : unions de types connus. Chaque valeur est rangée sous le type Go exact
// de son membre, puis ressortie par une assertion. Valeurs attendues : Node.

interface User {
	name: string;
	age: number;
}

// Le scénario étudié : un string, un littéral et un objet dans la même union.
// eslint-disable-next-line typescript/no-redundant-type-constituents -- c'est le cas testé
type Value = string | "admin" | User;

function describe(value: Value) {
	if (value === "admin") {
		return "ADMIN";
	}

	if (typeof value === "string") {
		return `texte:${value}`;
	}

	return `user:${value.name}/${value.age + 1}`;
}

const ada: User = {
	name: "Ada",
	age: 36,
};

// 1. Le cas de départ : un string, un littéral, un User.
export function basics() {
	return [describe("admin"), describe("bonjour"), describe(ada)];
}

// 2. Une liste mélangée, avec un objet littéral directement dedans.
export function mixedList() {
	const values: Value[] = [
		"admin",
		"x",
		{
			name: "Bob",
			age: 7,
		},
	];

	return DArray.map(values, describe);
}

// 3. Un objet plus grand qui entre dans l'union : rangé comme un User.
export function widerObject() {
	const dan = {
		name: "Dan",
		age: 3,
		admin: true,
	};

	return describe(dan);
}

// 4. Union discriminée, objets littéraux passés directement.
type Shape = {
	kind: "circle";
	radius: number;
} | {
	kind: "square";
	side: number;
};

function area(shape: Shape) {
	if (shape.kind === "circle") {
		return shape.radius * 3;
	}

	return shape.side * shape.side;
}

export function discriminated() {
	return [
		area({
			kind: "circle",
			radius: 2,
		}),
		area({
			kind: "square",
			side: 3,
		}),
	];
}

// 5. Lire le discriminant sur toute une liste.
export function kinds() {
	const shapes: Shape[] = [
		{
			kind: "square",
			side: 1,
		},
		{
			kind: "circle",
			radius: 1,
		},
	];

	return DArray.map(shapes, (shape) => shape.kind);
}

// 6. Une union gardée telle quelle, puis affichée.
export function keptAsIs() {
	const value: Value = {
		name: "Cy",
		age: 1,
	};

	return value;
}

// 7. Une union dans un champ d'objet.
interface Message {
	id: number;
	payload: Value;
}

export function nestedUnion() {
	const message: Message = {
		id: 1,
		payload: {
			name: "Eve",
			age: 2,
		},
	};

	return describe(message.payload);
}

// 8. Une union renvoyée par une fonction, de deux branches différentes.
function choose(useUser: boolean): Value {
	if (useUser) {
		return ada;
	}

	return "admin";
}

export function returned() {
	return [describe(choose(true)), describe(choose(false))];
}

// 9. Union avec undefined.
function orDefault(value: number | undefined) {
	if (value === undefined) {
		return 0;
	}

	return value + 1;
}

export function optional() {
	return [orDefault(undefined), orDefault(4)];
}

// 10. `in` pour distinguer deux objets, puis lecture du membre rétréci.
type Animal = {
	name: string;
	barks: boolean;
} | {
	name: string;
	meows: boolean;
};

function sound(animal: Animal) {
	if ("barks" in animal) {
		return animal.barks ? `${animal.name}:wouf` : `${animal.name}:silence`;
	}

	return `${animal.name}:miaou`;
}

export function withIn() {
	return [
		sound({
			name: "Rex",
			barks: true,
		}),
		sound({
			name: "Tom",
			meows: true,
		}),
	];
}

// 11. Un switch qui couvre tous les cas : pas de return après.
function label(shape: Shape) {
	switch (shape.kind) {
		case "circle":
			return `rond ${shape.radius}`;
		case "square":
			return `carré ${shape.side}`;
	}
}

export function exhaustive() {
	return [
		label({
			kind: "square",
			side: 4,
		}),
		label({
			kind: "circle",
			radius: 1,
		}),
	];
}

// 12. `number | undefined` en retour (la config Duplo impose le `return` final).
function firstPositive(values: number[]): number | undefined {
	for (const value of values) {
		if (value > 0) {
			return value;
		}
	}

	return undefined;
}

export function fallThrough() {
	return [firstPositive([-1, 3]), firstPositive([-1])];
}

export function show(value: unknown) {
	return DCommon.print(value);
}
