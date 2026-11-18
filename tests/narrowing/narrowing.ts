import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";

// D-18 phase 2 : adaptation aux points de narrowing, isLeft et unwrapRight.

export function failed(): DEither.Fail | DEither.Success<number> {
	return DEither.fail();
}

export function succeeded(value: number): DEither.Fail | DEither.Success<number> {
	return DEither.success(value);
}

export function onlySuccess(value: number): DEither.Success<number> {
	return DEither.success(value);
}

// Élargissement : une valeur brute rendue là où une union d'Either est attendue.
export function widened(value: number): number | DEither.Fail {
	return value;
}

export function acceptsUnion(input: number | DEither.Fail) {
	return DEither.isLeft(input);
}

export function widenedArgument(value: number) {
	return acceptsUnion(value + 1);
}

// isLeft : Fail -> true, Success -> false, valeur brute (TagValue) -> false.
export function leftCheck(input: DEither.Fail | DEither.Success<number>) {
	return DEither.isLeft(input);
}

export function rightCheck(input: number | DEither.Fail) {
	return DEither.isRight(input);
}

// unwrapRight : le type du résultat choisit la traduction.
export function unwrapped(input: DEither.Fail | DEither.Success<number>) {
	return DEither.unwrapRight(input);
}

export function unwrappedSuccess(input: DEither.Success<number>) {
	return DEither.unwrapRight(input) + 1;
}

export function unwrappedRaw(value: number) {
	return DEither.unwrapRight(value);
}

export function piped(input: DEither.Fail | DEither.Success<number>) {
	return DCommon.pipe(input, DEither.unwrapRight);
}

export function pipedLeftCheck(input: DEither.Fail | DEither.Success<number>) {
	return acceptsUnion(DCommon.pipe(input, DEither.unwrapRight));
}
