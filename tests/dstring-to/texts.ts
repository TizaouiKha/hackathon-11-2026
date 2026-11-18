import * as DString from "@duplojs/lang/string";

// Compare les textes produits par DString.to : renvoie un booléen, ce qui évite
// d'avoir besoin du type `string` (étape 6) pour tester la traduction.
export function sameText(one: number, two: number) {
	return DString.to(one) === DString.to(two);
}
