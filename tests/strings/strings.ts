import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import * as DString from "@duplojs/lang/string";

// D-18 phase 4 : chaînes avec la sémantique de JavaScript (unités UTF-16).

export function length(text: string) {
	return DString.length(text);
}

export function slice(text: string, start: number, end: number) {
	return DString.slice(text, start, end);
}

export function substring(text: string, start: number, end: number) {
	return DString.substring(text, start, end);
}

export function substringFrom(text: string, start: number) {
	return DString.substring(text, start);
}

export function charAt(text: string, index: number) {
	return DString.charAt(text, index);
}

export function at(text: string, index: number) {
	return DString.at(text, index);
}

export function indexOf(text: string, search: string) {
	return DString.indexOf(text, search);
}

export function indexOfFrom(text: string, search: string, position: number) {
	return DString.indexOf(text, search, position);
}

export function includes(text: string, search: string) {
	return DString.includes(text, search);
}

export function startsWith(text: string, search: string) {
	return DString.startsWith(text, search);
}

export function endsWith(text: string, search: string) {
	return DString.endsWith(text, search);
}

export function toUpperCase(text: string) {
	return DString.toUpperCase(text);
}

export function toLowerCase(text: string) {
	return DString.toLowerCase(text);
}

// Formes curryfiées, dans un pipe.
export function curriedSlice(text: string, start: number, end: number) {
	return DCommon.pipe(text, DString.slice(start, end));
}

export function curriedSubstring(text: string, start: number) {
	return DCommon.pipe(text, DString.substring(start));
}

export function curriedIncludes(text: string, search: string) {
	return DCommon.pipe(text, DString.includes(search));
}

export function curriedCharAt(text: string, index: number) {
	return DCommon.pipe(text, DString.charAt(index));
}

export function curriedAt(text: string, index: number) {
	return DCommon.pipe(text, DString.at(index));
}

export function curriedIndexOf(text: string, search: string) {
	return DCommon.pipe(text, DString.indexOf(search));
}

export function curriedStartsWith(text: string, search: string) {
	return DCommon.pipe(text, DString.startsWith(search));
}

export function curriedEndsWith(text: string, search: string) {
	return DCommon.pipe(text, DString.endsWith(search));
}

// Régression (review de la PR) : sur une chaîne contrainte, TS sait que
// `at(text, 0)` est une `string`, alors que le helper Go renvoie `any`.
export function firstOfNonEmpty(text: string & DString.MinCharacters<1>) {
	return DString.at(text, 0);
}

// Passée comme fonction : le helper Go a déjà la bonne signature.
export function lengthFunction() {
	return DString.length;
}

export function upperCaseFunction() {
	return DString.toUpperCase;
}

export function lowerCaseFunction() {
	return DString.toLowerCase;
}

// Le cas du prof : une longueur rangée dans un Either.
export function usernameLength(username: string) {
	return DEither.success(DString.length(username));
}
