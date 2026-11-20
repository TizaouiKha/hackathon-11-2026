import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DObject from "@duplojs/lang/object";

// Du code DuploJS ordinaire : la bibliothèque plutôt que des boucles.

interface User {
	name: string;
	age: number;
	active: boolean;
}

const users: User[] = [
	{
		name: "Ada",
		age: 36,
		active: true,
	},
	{
		name: "Bob",
		age: 7,
		active: false,
	},
	{
		name: "Cy",
		age: 21,
		active: true,
	},
];

// filter puis map, curryfiés dans un pipe.
const activeNames = DCommon.pipe(
	users,
	DArray.filter((user) => user.active),
	DArray.map((user) => user.name),
);

DCommon.print(`actifs : ${activeNames}`);

// reduce avec son outil `next`.
const totalAge = DArray.reduce(users, 0, ({ element, lastValue, next }) => next(lastValue + element.age));

DCommon.print(`âge total : ${totalAge}`);

// pick : la forme du résultat est connue à la compilation.
DCommon.print(DObject.pick(users[0]!, ["name"]));
