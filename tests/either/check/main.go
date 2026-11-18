// Test d'exécution de la représentation des Either (DECISIONS.md D-09.1, D-18 : EitherAny).
// Appelle les fonctions transpilées depuis shapes.ts et vérifie les valeurs Go.
// Lancé par ./.commands/test-runtime.sh (copié dans dist/check/ après la transpilation).
package main

import (
	"fmt"
	"os"

	shapes "duplojs.local/transpiled/shapes.ts"
	shard "duplojs.local/transpiled/shard_dependencies"
)

var failures = 0

func expect(name string, got, want any) {
	status := "OK  "
	if fmt.Sprint(got) != fmt.Sprint(want) {
		status = "FAIL"
		failures++
	}
	fmt.Printf("%s %-40s got=%v want=%v\n", status, name, got, want)
}

func main() {
	fail := shapes.Sourced_explicitFail()
	expect("fail: IsRight", fail.Tag.IsRight(), false)
	expect("fail: Information", fail.Tag.Information(), "fail")
	expect("fail: Value = JSUndefined", fmt.Sprintf("%T", fail.Value), "shard_dependencies.JSUndefined")

	success := shapes.Sourced_explicitSuccess(1, 2)
	expect("success: IsRight", success.Tag.IsRight(), true)
	expect("success: Information", success.Tag.Information(), "success")
	expect("success: Value (assertion float64)", success.Value.(float64), 3)
	expect("success: String()", success.Tag.String(), "success")

	left := shapes.Sourced_inferredLeft(7)
	expect("left inféré: IsRight", left.Tag.IsRight(), false)
	expect("left inféré: Information", left.Tag.Information(), "division-by-zero")
	expect("left inféré: Value", left.Value.(float64), 7)

	literal := shapes.Sourced_literalLeft()
	expect("littéral élargi: Information", literal.Tag.Information(), "negative-operand")
	expect("littéral élargi: Value", literal.Value.(float64), 2)

	// Valeurs de types différents dans la même union : un seul type Go, EitherAny.
	mixed := shapes.Sourced_mixed()
	expect("types mélangés, gauche: IsRight", mixed.Tag.IsRight(), false)
	expect("types mélangés, gauche: Information", mixed.Tag.Information(), "negative-operand")
	expect("types mélangés, gauche: Value", mixed.Value.(float64), 1)

	mixedRight := shapes.Sourced_mixedRight(5)
	inner := mixedRight.Value.(shard.EitherAny)
	expect("types mélangés, droite: IsRight", mixedRight.Tag.IsRight(), true)
	expect("types mélangés, droite: Information", mixedRight.Tag.Information(), "success")
	expect("types mélangés, droite: Either imbriqué", inner.Value.(float64), 5)
	expect("types mélangés, droite: Information imbriquée", inner.Tag.Information(), "success")

	expect("même information, même tag", literal.Tag == mixed.Tag, true)
	expect("informations différentes, tags différents", left.Tag != literal.Tag, true)

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
