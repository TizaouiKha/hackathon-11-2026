// Test d'exécution de DString.to (étape 8b, D-12) : DString.to(a) === DString.to(b).
// Le formatage lui-même est testé en détail par tests/js-number-to-string.
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"math"
	"os"

	texts "duplojs.local/transpiled/texts.ts"
)

var failures = 0

func expect(name string, got, want any) {
	status := "OK  "
	if fmt.Sprint(got) != fmt.Sprint(want) {
		status = "FAIL"
		failures++
	}
	fmt.Printf("%s %-36s got=%v want=%v\n", status, name, got, want)
}

func main() {
	expect("to(1) === to(1)", texts.Sourced_sameText(1, 1), true)
	expect("to(2) === to(3)", texts.Sourced_sameText(2, 3), false)
	// Addition faite à l'exécution : une constante Go `0.1+0.2` serait calculée exactement (= 0.3).
	tenth, fifth := 0.1, 0.2
	expect("to(0.1 + 0.2) === to(0.3)", texts.Sourced_sameText(tenth+fifth, 0.3), false)
	expect("to(-0) === to(0)", texts.Sourced_sameText(math.Copysign(0, -1), 0), true)
	// En nombre, NaN != NaN ; en texte, "NaN" === "NaN".
	expect("to(NaN) === to(NaN)", texts.Sourced_sameText(math.NaN(), math.NaN()), true)
	expect("to(1e21) === to(1e21)", texts.Sourced_sameText(1e21, 1e21), true)

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
