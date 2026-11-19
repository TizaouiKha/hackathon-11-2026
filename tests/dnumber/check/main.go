// Test d'exécution de D-25 : fonctions DNumber, avec les cas limites de JS.
// Valeurs attendues : celles de Node (tests/dnumber/number.ts avec tsx).
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"

	number "duplojs.local/transpiled/number.ts"
	shard "duplojs.local/transpiled/shard_dependencies"
)

var failures = 0

func expect(name string, got any, want string) {
	shown := shard.Inspect(got)
	status := "OK  "
	if shown != want {
		status = "FAIL"
		failures++
	}
	fmt.Printf("%s %-12s %s\n", status, name, shown)
	if shown != want {
		fmt.Printf("     attendu : %s\n", want)
	}
}

func main() {
	expect("comparisons", number.Sourced_comparisons(), "[ true, true, false, true, true, true ]")
	expect("parity", number.Sourced_parity(), "[ true, true, true, false, true ]")
	expect("integers", number.Sourced_integers(), "[ true, false, false, true, false ]")
	expect("signs", number.Sourced_signs(), "[ true, true, false, true, false ]")
	expect("totals", number.Sourced_totals(), "[ 6.5, 0 ]")
	expect("extremes", number.Sourced_extremes(), "[ 5, 2, 5, 2, NaN ]")
	expect("sorted", number.Sourced_sorted(), "[ [ 1, 2, 3 ], [ 3, 2, 1 ] ]")
	expect("asValues", number.Sourced_asValues(), "[ [ 2, 4 ], [ 3, 4 ] ]")

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
