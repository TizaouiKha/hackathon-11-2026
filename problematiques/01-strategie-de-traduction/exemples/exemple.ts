import * as DCommon from "@duplojs/lang/common";
import * as DEither from "@duplojs/lang/either";
import { success as ok } from "@duplojs/lang/either";

// Un ternaire (une expression) et un import renommé : `ok` est `success`.

function classify(value: number) {
	const label = value >= 0 ? "positif" : "négatif";

	return ok(label);
}

const result = classify(-3);

DCommon.print(DEither.isRight(result) ? `succès : ${DEither.unwrapRight(result)}` : "erreur");
