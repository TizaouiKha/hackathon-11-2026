import * as DCommon from "@duplojs/lang/common";

// 1. Un texte, un littéral ou un objet.

interface User {
	name: string;
	age: number;
}

type Value = string | "admin" | User;

function describe(value: Value) {
	if (value === "admin") {
		return "ADMIN";
	}

	if (typeof value === "string") {
		return `texte:${value}`;
	}

	return `user:${value.name}/${value.age}`;
}

// 2. Une union discriminée, lue avec un switch et avec `in`.

type Shape = { kind: "circle"; radius: number } | { kind: "square"; side: number };

function area(shape: Shape) {
	switch (shape.kind) {
		case "circle":
			return shape.radius * shape.radius * 3;
		case "square":
			return shape.side * shape.side;
	}
}

function hasRadius(shape: Shape) {
	return "radius" in shape;
}

const values: Value[] = [
	"admin",
	"bonjour",
	{
		name: "Ada",
		age: 36,
	},
];

for (const value of values) {
	DCommon.print(describe(value));
}

const shapes: Shape[] = [
	{
		kind: "circle",
		radius: 2,
	},
	{
		kind: "square",
		side: 3,
	},
];

for (const shape of shapes) {
	DCommon.print(`${shape.kind} : aire ${area(shape)}, rayon ${hasRadius(shape) ? "oui" : "non"}`);
}
