import * as DCommon from "@duplojs/lang/common";

// Les pièges des nombres et des chaînes de JavaScript.

const zero: number = Number("0");
const big = 2 ** 31;

DCommon.print(`0.1 + 0.2 = ${0.1 + 0.2}`);
DCommon.print(`-7 % 3 = ${-7 % 3}`);
DCommon.print(`Math.round(-2.5) = ${Math.round(-2.5)}`);
DCommon.print(`1e21 = ${1e21}`);
DCommon.print(`-0 = ${-0}`);
DCommon.print(`1 / 0 = ${1 / zero}`);
DCommon.print(`2 ** 31 | 0 = ${big | 0}`);
DCommon.print(`"é".length = ${"é".length}`);
DCommon.print(`"😀".length = ${"😀".length}`);
