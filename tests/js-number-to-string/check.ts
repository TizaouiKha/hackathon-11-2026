/**
 * Test du helper Go `JSNumberToString` (DString.to, D-12).
 * Pas de TypeScript à transpiler : on imprime la shared dependency telle que
 * le transpileur la génère, on fait calculer les valeurs attendues par Node
 * (`String(x)`), puis on exécute le Go et on compare ligne par ligne.
 * Les nombres sont transmis au Go bit pour bit (`math.Float64frombits`).
 * Lancé par ./.commands/test-runtime.sh.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoAST, GoPrinter } from "@go";
import { jsNumberToStringDependency } from "../../src/transpiler/transformers/duplojs/string/to/sharedDependency";

const values: readonly number[] = [
	0,
	-0,
	1,
	-1,
	3,
	-12,
	2.5,
	0.1,
	0.1 + 0.2,
	1 / 3,
	-2 / 3,
	123.456,
	100,
	1e6,
	2 ** 53,
	(2 ** 53) + 2,
	1e20,
	123456789012345680000,
	9.99e20,
	1e21,
	1.5e21,
	1e300,
	1.7976931348623157e308,
	0.000001,
	0.0000015,
	-0.0000015,
	0.000001234,
	1e-7,
	1.5e-7,
	1.23e-10,
	5e-324,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
];

// 2 000 nombres aléatoires (tous les bits possibles d'un float64), graine fixe : test reproductible.
function randomValues(count: number) {
	let state = 0x9E3779B97F4A7C15n;
	const view = new DataView(new ArrayBuffer(8));

	return Array.from({ length: count }, () => {
		state = ((state * 6364136223846793005n) + 1442695040888963407n) % (1n << 64n);
		view.setBigUint64(0, state);

		return view.getFloat64(0);
	});
}

function report(line: string) {
	process.stdout.write(`${line}
`);
}

const randomCount = 2000;
const allValues = [...values, ...randomValues(randomCount)];

function float64Bits(value: number) {
	const view = new DataView(new ArrayBuffer(8));
	view.setFloat64(0, value);

	return view.getBigUint64(0).toString();
}

const directory = join(import.meta.dirname, "dist");
rmSync(directory, {
	recursive: true,
	force: true,
});
mkdirSync(join(directory, "jsnumber"), { recursive: true });

const dependency = jsNumberToStringDependency.value;

writeFileSync(join(directory, "go.mod"), "module jsnumbertest\n\ngo 1.27.4\n");
writeFileSync(
	join(directory, "jsnumber", "jsnumber.go"),
	GoPrinter.printGoFile(GoAST.createGoFile({
		packageName: GoAST.createIdentifier("jsnumber"),
		imports: dependency.imports,
		declarations: dependency.declarations,
	})),
);
writeFileSync(
	join(directory, "main.go"),
	[
		"package main",
		"",
		"import (",
		"\t\"fmt\"",
		"\t\"math\"",
		"",
		"\t\"jsnumbertest/jsnumber\"",
		")",
		"",
		"func main() {",
		...allValues.map((value) => `\tfmt.Println(jsnumber.JSNumberToString(math.Float64frombits(${float64Bits(value)})))`),
		"}",
		"",
	].join("\n"),
);

const actual = execFileSync("go", ["run", "."], {
	cwd: directory,
	encoding: "utf8",
}).trimEnd().split("\n");

let failures = 0;

allValues.forEach((value, index) => {
	const expected = String(value);
	const got = actual[index];
	const ok = got === expected;

	if (!ok) {
		failures += 1;
	}

	if (!ok || index < values.length) {
		report(`${ok ? "OK  " : "FAIL"} ${String(Object.is(value, -0) ? "-0" : value).padEnd(26)} got=${got} want=${expected}`);
	}
});

if (failures > 0) {
	report(`\n${failures} échec(s)`);
	process.exit(1);
}

report(`\nTous les contrôles passent : ${actual.length} nombres comparés (${values.length} cas limites + ${randomCount} aléatoires).`);
