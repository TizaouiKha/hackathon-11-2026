import * as DArray from "@duplojs/lang/array";
import * as DCommon from "@duplojs/lang/common";
import * as DNumber from "@duplojs/lang/number";

// Le style fonctionnel de DuploJS.

const double = (value: number) => value * 2;
const addTen = (value: number) => value + 10;

// 1. Enchaîner des fonctions.
DCommon.print(`pipe : ${DCommon.pipe(5, double, addTen)}`);

// 2. Une forme curryfiée (sans la donnée), dans un pipe.
const tenTimes = DCommon.pipe([1, 2, 3], DArray.map((value) => value * 10));

DCommon.print(`map curryfié : ${tenTimes}`);

// 3. Une fonction DuploJS passée en valeur.
DCommon.print(`filter + isEven : ${DArray.filter([1, 2, 3, 4], DNumber.isEven)}`);

// 4. Un callback qui ignore ses paramètres.
DCommon.print(`callback sans paramètre : ${DArray.map([1, 2], () => 0)}`);
