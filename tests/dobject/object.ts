import * as DCommon from "@duplojs/lang/common";
import * as DObject from "@duplojs/lang/object";

// D-24 : fonctions DObject. Valeurs attendues : celles de Node.

// Un alias `type` (et non une `interface`) : `DObject.values` attend un `Record`.
// eslint-disable-next-line typescript/consistent-type-definitions -- voir ci-dessus
type User = {
	id: number;
	name: string;
	email: string;
	isActive: boolean;
};

const user: User = {
	id: 1,
	name: "John",
	email: "j@x.io",
	isActive: true,
};

export function picked() {
	return DObject.pick(user, ["name", "email"]);
}

export function pickedWithObject() {
	return DObject.pick(user, { name: true });
}

export function pickedCurried() {
	return DCommon.pipe(user, DObject.pick(["id"]));
}

export function omitted() {
	return DObject.omit(user, ["email", "isActive"]);
}

export function assigned() {
	return DObject.assign(user, { name: "Ada" });
}

export function assignedNewField() {
	return DObject.assign(user, { role: "admin" });
}

export function overridden() {
	return DObject.override(user, { name: "Ada" });
}

export function property() {
	return DObject.getProperty(user, "name");
}

export function propertyCurried() {
	return DCommon.pipe(user, DObject.getProperty("email"));
}

export function deepProperty() {
	const team = {
		size: 3,
		leader: user,
	};

	return DObject.getDeepProperty(team, "leader.name");
}

export function transformed() {
	return DObject.transformProperty(user, "id", (id) => id * 10);
}

export function keysOf() {
	return DObject.keys(user);
}

export function valuesOf() {
	return DObject.values(user);
}

export function entriesOf() {
	return DObject.entries({
		first: 1,
		second: 2,
	});
}

export function counted() {
	return DObject.countKeys(user);
}

export function show(value: unknown) {
	return DCommon.print(value);
}
