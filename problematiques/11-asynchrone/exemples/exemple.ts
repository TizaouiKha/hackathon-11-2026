import * as DCommon from "@duplojs/lang/common";

// Aucune vraie entrée-sortie : chaque await attend un calcul déjà prêt.

function fetchPrice(name: string) {
	return Promise.resolve(name.length * 2);
}

async function total(names: string[]) {
	let sum = 0;

	for (const name of names) {
		DCommon.print(`prix de ${name}`);
		sum += await fetchPrice(name);
	}

	return sum;
}

DCommon.print("début");
DCommon.print(`total = ${await total(["stylo", "cahier"])}`);
DCommon.print("fin");
