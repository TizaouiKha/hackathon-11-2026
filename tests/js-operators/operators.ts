// Opérateurs JavaScript sans équivalent direct en Go (revue adversariale de l'étape 5).

function addOne(value: number) {
	return value + 1;
}

// Littéral trop grand : vaut Infinity en JavaScript (perte de précision voulue pour le test).
export function infinityLiteral() {
	// eslint-disable-next-line no-loss-of-precision
	return 1e400;
}

// % : signe du dividende, NaN pour une division par 0 (math.Mod).
export function modulo(one: number, two: number) {
	return one % two;
}

// Opérateurs sur les bits : conversion en entier 32 bits (ToInt32 / ToUint32).
export function bitAnd(one: number, two: number) {
	return one & two;
}

export function bitOr(one: number, two: number) {
	return one | two;
}

export function bitXor(one: number, two: number) {
	return one ^ two;
}

export function leftShift(one: number, two: number) {
	return one << two;
}

export function signedRightShift(one: number, two: number) {
	return one >> two;
}

export function unsignedRightShift(one: number, two: number) {
	return one >>> two;
}

// && / || entre nombres : renvoient la valeur d'un opérande.
export function numberOr(one: number, two: number) {
	return one || two;
}

export function numberAnd(one: number, two: number) {
	return one && two;
}

// Le membre droit (un appel) n'est évalué que si nécessaire.
export function numberOrCall(one: number) {
	return one || addOne(one);
}

// Entre booléens : inchangé.
export function booleanOr(one: boolean, two: boolean) {
	return one || two;
}
