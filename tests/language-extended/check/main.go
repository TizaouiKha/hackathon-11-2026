// Test d'exécution des constructions de D-19 (propriétés, éléments, objets,
// affectations, boucles, switch, types locaux). Chaque résultat est affiché avec
// Inspect (ce que fait DCommon.print) et comparé à util.inspect de Node.
// Cas générés par tests/language-extended/generate.ts (check/cases.go).
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"

	shard "duplojs.local/transpiled/shard_dependencies"
)

type testCase struct {
	name string
	run  func() any
	want string
}

func main() {
	failures := 0
	all := cases()
	for _, check := range all {
		got := shard.Inspect(check.run())
		if got != check.want {
			failures++
			fmt.Printf("FAIL %s\n  got:  %s\n  want: %s\n", check.name, got, check.want)
		}
	}
	fmt.Printf("%d cas, %d échec(s)\n", len(all), failures)
	if failures > 0 {
		os.Exit(1)
	}
	fmt.Println("Tous les contrôles passent.")
}
