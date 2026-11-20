import * as DCommon from "@duplojs/lang/common";

// Un objet « plus grand » passé là où un type plus petit est attendu.

interface User {
	id: number;
	name: string;
	email: string;
}

function greet(person: { name: string }) {
	return `Bonjour ${person.name}`;
}

function greetAll(people: { name: string }[]) {
	let text = "";

	for (const person of people) {
		text = `${text}[${greet(person)}]`;
	}

	return text;
}

const ada: User = {
	id: 1,
	name: "Ada",
	email: "ada@example.com",
};

const team: User[] = [
	ada,
	{
		id: 2,
		name: "Bob",
		email: "bob@example.com",
	},
];

DCommon.print(greet(ada));
DCommon.print(greetAll(team));
