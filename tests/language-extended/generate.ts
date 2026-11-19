/**
 * Génère `check/cases.go` : chaque appel est exécuté ici avec Node, et son
 * affichage (`util.inspect`, ce que fait `DCommon.print`) devient la valeur
 * attendue du `Inspect` Go. À relancer après une modification :
 * `node_modules/.bin/tsx tests/language-extended/generate.ts > tests/language-extended/check/cases.go`
 */
import { inspect } from "node:util";
import * as Language from "./language";

type Argument = string | number | boolean | undefined | readonly number[];

function goArgument(value: Argument): string {
	if (value === undefined) {
		return "shard.JSUndefined{}";
	}

	if (typeof value === "boolean") {
		return String(value);
	}

	if (typeof value === "string") {
		return JSON.stringify(value);
	}

	if (typeof value === "number") {
		// `float64(…)` : une constante Go rangée dans un `any` serait un `int`.
		if (Number.isNaN(value)) {
			return "math.NaN()";
		}

		return Object.is(value, -0) ? "math.Copysign(0, -1)" : `float64(${value})`;
	}

	return `[]float64{${value.join(", ")}}`;
}

const lines: string[] = [];

function add(name: keyof typeof Language, ...args: readonly Argument[]) {
	const call = `${name}(${args.map(goArgument).join(", ")})`;
	const run = Language[name] as (...values: unknown[]) => unknown;
	// Une copie : `setFirst` modifie son tableau, comme en Go.
	const value = run(...args.map((argument) => (Array.isArray(argument) ? [...argument] : argument)));

	// Comme `DCommon.print` (`console.log`) : une chaîne seule s'affiche sans guillemets.
	const shown = typeof value === "string" ? value : inspect(value);

	lines.push(`\t\t{${JSON.stringify(call)}, func() any { return languageTs.Sourced_${call} }, ${JSON.stringify(shown)}},`);
}

for (const [name, age] of [["ada", 36], ["bob", 7]] as const) {
	add("userAge", name, age);
	add("describeUser", name, age);
}

add("leaderName", "ada");

for (const values of [[], [1], [3, 4, 5], [1.5, -2]]) {
	add("arrayLength", values);
	add("first", values);
	add("sum", values);
}

add("setFirst", [1, 2]);

for (const text of ["", "abc", "héllo", "😀a😀"]) {
	add("textLength", text);
	add("characters", text);
}

add("pairSecond", "answer", 42);

for (const key of ["ada", "bob", "eve"]) {
	add("score", key);
}

for (const start of [0, 1, 3]) {
	add("countdown", start);
}

for (const limit of [0, 2, 4, 10]) {
	add("skipAndStop", limit);
}

for (const value of [1, 2, 3, 4]) {
	add("grade", value);
}

for (const kind of ["a", "b", "c"]) {
	add("fallThrough", kind);
}

add("localType", 21);

add("sentence", "ada", 36, true);
add("listText", [1, 2.5, -3]);
add("listText", []);

for (const value of ["abc", "😀", 7]) {
	add("lengthOf", value);
}

for (const value of ["a", 1, false]) {
	add("kindOf", value);
}

add("orDefault", "ada");
add("orDefault", undefined);

for (const value of [2.5, -2.5, -0.4, 1.4, 0.5, -0.5, 3, Number.NaN]) {
	add("rounding", value);
}

add("largest", 1, 7, 3);
add("largest", -1, Number.NaN, 3);

for (const value of [5, -5, 0, -0]) {
	add("signOf", value);
}

add("circleArea", 2);

for (const value of [-3, 0, 4]) {
	add("narrowed", value);
}

add("indexed", [10, 20, 30]);
add("selfLength", [7, 8]);
add("swap", 1, 2);
add("userLabel", "ada", 36);

for (const [first, second] of [[1, 2], [-1, 2], [1, -2], [-1, -2]]) {
	add("groupBoth", first, second);
	add("lazyCalls", first, second);
}

const file = `// Code généré par tests/language-extended/generate.ts : ne pas modifier à la main.
// Valeurs attendues : util.inspect de Node sur tests/language-extended/language.ts.
package main

import (
	"math"

	languageTs "duplojs.local/transpiled/language.ts"
	shard "duplojs.local/transpiled/shard_dependencies"
)

var _ = shard.JSUndefined{}

var _ = math.NaN

func cases() []testCase {
	return []testCase{
${lines.join("\n")}
	}
}
`;

process.stdout.write(file);
