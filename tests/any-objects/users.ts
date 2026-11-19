/* eslint-disable typescript/no-unsafe-member-access */
// Ce test manipule exprès des `any` : c'est le scénario étudié (D-20).
import * as DCommon from "@duplojs/lang/common";

interface User {
	name: string;
	age: number;
}

interface Profile {
	name: string;
	nickname?: string;
}

// 1. Objet construit avec l'interface.
export function typedUser(): User {
	return {
		name: "ada",
		age: 36,
	};
}

// 2. Objet `any`, sans l'interface, champs dans le même ordre.
export function untypedSameOrder(): User {
	const raw: any = {
		name: "ada",
		age: 36,
	};

	return raw;
}

// 3. Champs dans un autre ordre.
export function untypedOtherOrder(): User {
	const raw: any = {
		age: 36,
		name: "ada",
	};

	return raw;
}

// 4. Un champ en trop : perdu en Go (un struct a une forme fixe).
export function untypedExtraField(): User {
	const raw: any = {
		name: "ada",
		age: 36,
		admin: true,
	};

	return raw;
}

// 5. Un champ du mauvais type : arrêt avec un message clair.
export function untypedWrongType(): User {
	const raw: any = {
		name: "ada",
		age: "36",
	};

	return raw;
}

// 6. Lire une propriété directement sur le any.
export function readName() {
	const raw: any = {
		name: "ada",
		age: 36,
	};

	return raw.name;
}

export function readMissing() {
	const raw: any = { name: "ada" };

	return raw.missing;
}

export function readLength() {
	const raw: any = "😀a";

	return raw.length;
}

// 7. Un tableau d'objets `any` utilisé comme `User[]`.
export function untypedList(): User[] {
	const raw: any = [
		{
			name: "ada",
			age: 36,
		},
		{
			age: 7,
			name: "bob",
		},
	];

	return raw;
}

// 8. Champ facultatif absent : undefined, comme JS.
export function missingOptional(): Profile {
	const raw: any = { name: "ada" };

	return raw;
}

// 9. Littéraux booléens.
export function flags() {
	return [true, false];
}

export function show(value: unknown) {
	return DCommon.print(value);
}
