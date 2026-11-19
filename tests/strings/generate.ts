/**
 * Génère `check/cases.go` : chaque appel est exécuté ici avec Node (valeur
 * attendue), puis rejoué en Go par le test. À relancer après une modification :
 * `node_modules/.bin/tsx tests/strings/generate.ts > tests/strings/check/cases.go`
 */
import * as Strings from "./strings";

const texts = ["", "abc", "héllo", "😀a😀", "straße", "İstanbul", "ﬁx", "a\u0301b", "ΟΔΟΣ"];
const positions = [0, 1, 2, 3, -1, -2, 1.7, -1.5, 10, -10, Number.NaN, Infinity, -Infinity];
const searches = ["", "l", "😀", "ß", "a", "x"];

function goString(value: string) {
	return JSON.stringify(value);
}

function goNumber(value: number) {
	if (Number.isNaN(value)) {
		return "math.NaN()";
	}

	if (value === Infinity) {
		return "math.Inf(1)";
	}

	if (value === -Infinity) {
		return "math.Inf(-1)";
	}

	return String(value);
}

const eitherValueKey = "@duplojs/lang/kind/@DuplojsLangEither/value";

const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu;

// Ce que Node affiche : une moitié de paire UTF-16 devient U+FFFD.
function render(value: unknown): string {
	if (value === undefined) {
		return "undefined";
	}

	if (typeof value === "string") {
		return value.replace(loneSurrogate, "\uFFFD");
	}

	if (typeof value === "object" && value !== null) {
		return `either:${render((value as Record<string, unknown>)[eitherValueKey])}`;
	}

	return String(value as number | boolean);
}

const lines: string[] = [];

function add(name: string, goArguments: readonly string[], value: unknown) {
	const call = `${name}(${goArguments.join(", ")})`;

	lines.push(
		`\t\t{${goString(call)}, func() any { return stringsTs.Sourced_${call} }, ${goString(render(value))}},`,
	);
}

for (const text of texts) {
	const goText = goString(text);

	add("length", [goText], Strings.length(text));
	add("toUpperCase", [goText], Strings.toUpperCase(text));
	add("toLowerCase", [goText], Strings.toLowerCase(text));
	add("usernameLength", [goText], Strings.usernameLength(text));

	for (const position of positions) {
		const goPosition = goNumber(position);

		add("charAt", [goText, goPosition], Strings.charAt(text, position));
		add("at", [goText, goPosition], Strings.at(text, position));
		add("substringFrom", [goText, goPosition], Strings.substringFrom(text, position));
		add("curriedSubstring", [goText, goPosition], Strings.curriedSubstring(text, position));

		for (const end of positions) {
			const goEnd = goNumber(end);

			add("slice", [goText, goPosition, goEnd], Strings.slice(text, position, end));
			add("substring", [goText, goPosition, goEnd], Strings.substring(text, position, end));
			add("curriedSlice", [goText, goPosition, goEnd], Strings.curriedSlice(text, position, end));
		}
	}

	for (const search of searches) {
		const goSearch = goString(search);

		add("indexOf", [goText, goSearch], Strings.indexOf(text, search));
		add("includes", [goText, goSearch], Strings.includes(text, search));
		add("startsWith", [goText, goSearch], Strings.startsWith(text, search));
		add("endsWith", [goText, goSearch], Strings.endsWith(text, search));
		add("curriedIncludes", [goText, goSearch], Strings.curriedIncludes(text, search));

		for (const position of positions) {
			add("indexOfFrom", [goText, goSearch, goNumber(position)], Strings.indexOfFrom(text, search, position));
		}
	}
}

const file = `// Code généré par tests/strings/generate.ts : ne pas modifier à la main.
// Valeurs attendues obtenues en exécutant tests/strings/strings.ts avec Node.
package main

import (
	"math"

	stringsTs "duplojs.local/transpiled/strings.ts"
)

var _ = math.NaN

func cases() []testCase {
	return []testCase{
${lines.join("\n")}
	}
}
`;

process.stdout.write(file);
