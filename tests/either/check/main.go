// Test d'exécution de l'étape 3 (représentation des Either, DECISIONS.md D-09).
// Appelle les fonctions transpilées depuis shapes.ts et vérifie les valeurs Go.
// Lancé par ./.commands/test-runtime.sh (copié dans dist/check/ après la transpilation).
package main

import (
	"fmt"
	"os"

	shapes "duplojs.local/transpiled/shapes.ts"
)

var failures = 0

func expect(name string, got, want any) {
	status := "OK  "
	if fmt.Sprint(got) != fmt.Sprint(want) {
		status = "FAIL"
		failures++
	}
	fmt.Printf("%s %-34s got=%v want=%v\n", status, name, got, want)
}

func main() {
	fail := shapes.Sourced_explicitFail()
	expect("fail: IsRight", fail.Tag.IsRight(), false)
	expect("fail: Information", fail.Tag.Information(), "fail")
	expect("fail: Value à zéro", fail.Value, 0)

	success := shapes.Sourced_explicitSuccess(1, 2)
	expect("success: IsRight", success.Tag.IsRight(), true)
	expect("success: Information", success.Tag.Information(), "success")
	expect("success: Value", success.Value, 3)
	expect("success: String()", success.Tag.String(), "success")

	left := shapes.Sourced_inferredLeft(7)
	expect("left inféré: IsRight", left.Tag.IsRight(), false)
	expect("left inféré: Information", left.Tag.Information(), "division-by-zero")
	expect("left inféré: Value", left.Value, 7)

	literal := shapes.Sourced_literalLeft()
	expect("littéral élargi: Information", literal.Tag.Information(), "negative-operand")
	expect("littéral élargi: Value", literal.Value, 2)

	mixed := shapes.Sourced_mixed()
	expect("Either2 gauche: IsRight", mixed.Tag.IsRight(), false)
	expect("Either2 gauche: Information", mixed.Tag.Information(), "negative-operand")
	expect("Either2 gauche: Left", mixed.Left, 1)

	mixedRight := shapes.Sourced_mixedRight(5)
	expect("Either2 droite: IsRight", mixedRight.Tag.IsRight(), true)
	expect("Either2 droite: Information", mixedRight.Tag.Information(), "success")
	expect("Either2 droite: Right.Value", mixedRight.Right.Value, 5)
	expect("Either2 droite: Right.Information", mixedRight.Right.Tag.Information(), "success")

	expect("même information, même tag", literal.Tag == mixed.Tag, true)
	expect("informations différentes, tags différents", left.Tag != literal.Tag, true)

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
