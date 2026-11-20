// Test d'exécution de D-27 : unions de types connus.
// Valeurs attendues : celles de Node (tests/unions/unions.ts avec tsx).
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"

	shard "duplojs.local/transpiled/shard_dependencies"
	unions "duplojs.local/transpiled/unions.ts"
)

var failures = 0

func expect(name string, got any, want string) {
	shown := shard.Inspect(got)
	status := "OK  "
	if shown != want {
		status = "FAIL"
		failures++
	}
	fmt.Printf("%s %-14s %s\n", status, name, shown)
	if shown != want {
		fmt.Printf("     attendu : %s\n", want)
	}
}

func main() {
	expect("basics", unions.Sourced_basics(), "[ 'ADMIN', 'texte:bonjour', 'user:Ada/37' ]")
	expect("mixedList", unions.Sourced_mixedList(), "[ 'ADMIN', 'texte:x', 'user:Bob/8' ]")
	expect("widerObject", unions.Sourced_widerObject(), "user:Dan/4")
	expect("discriminated", unions.Sourced_discriminated(), "[ 6, 9 ]")
	expect("kinds", unions.Sourced_kinds(), "[ 'square', 'circle' ]")
	expect("keptAsIs", unions.Sourced_keptAsIs(), "{ name: 'Cy', age: 1 }")
	expect("nestedUnion", unions.Sourced_nestedUnion(), "user:Eve/3")
	expect("returned", unions.Sourced_returned(), "[ 'user:Ada/37', 'ADMIN' ]")
	expect("optional", unions.Sourced_optional(), "[ 0, 5 ]")

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
