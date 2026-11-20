import * as DCommon from "@duplojs/lang/common";

// JavaScript lit les opérandes de gauche à droite.

let shared = 1;
let trace = "";

function change() {
	shared = 2;

	return shared;
}

function consume(first: number, second: number) {
	return `consume(${first}, ${second})`;
}

function log(name: string) {
	trace = `${trace}${name}`;

	return name;
}

function same(value: string) {
	return value;
}

DCommon.print(consume(shared, change()));

const pair = {
	first: log("a"),
	second: same(log("b")),
};

DCommon.print(`ordre des appels : ${trace} (${pair.first}${pair.second})`);
