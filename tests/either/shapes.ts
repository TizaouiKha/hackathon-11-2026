import * as DEither from "@duplojs/lang/either";

// Union explicite : `fail()` doit prendre le type de toute la fonction.
export function explicitFail(): (
	| DEither.Success<number>
	| DEither.Fail
) {
	return DEither.fail();
}

export function explicitSuccess(
	one: number,
	two: number,
): (
	| DEither.Success<number>
	| DEither.Fail
) {
	return DEither.success(one + two);
}

// Type de retour inféré par le checker.
export function inferredLeft(one: number) {
	return DEither.left("division-by-zero", one);
}

// `Left<"division-by-zero", 0>` : le littéral `0` doit être élargi en float64.
export function literalLeft(): (
	| DEither.Left<"division-by-zero", 0>
	| DEither.Left<"negative-operand", number>
	| DEither.Success<number>
) {
	return DEither.left("negative-operand", 2);
}

// Valeurs de types différents à droite et à gauche : Either2[R, L].
export function mixed(): (
	| DEither.Success<DEither.Success<number>>
	| DEither.Left<"negative-operand", number>
) {
	return DEither.left("negative-operand", 1);
}

export function mixedRight(one: number): (
	| DEither.Success<DEither.Success<number>>
	| DEither.Left<"negative-operand", number>
) {
	return DEither.success(DEither.success(one));
}
