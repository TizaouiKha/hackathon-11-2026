// Test d'exécution : les déclarations `type X = …` et `interface X { … }` ne
// produisent rien en Go, et les types qu'elles nomment sont traduits là où ils
// servent (alias de primitif, union d'Either, objet, objet imbriqué, tuple).
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"
	"reflect"

	declarations "duplojs.local/transpiled/declarations.ts"
	shard "duplojs.local/transpiled/shard_dependencies"
)

var failures = 0

func expect(name string, got, want string) {
	status := "OK  "
	if got != want {
		status = "FAIL"
		failures++
	}
	fmt.Printf("%s %-22s got=%s\n", status, name, got)
}

func signature(function any) string {
	return reflect.TypeOf(function).String()
}

func main() {
	user := `struct { Sourced_name string "json:\"name\""; Sourced_age float64 "json:\"age\"" }`
	team := `struct { Sourced_members []` + user + ` "json:\"members\""; Sourced_leader ` + user + ` "json:\"leader\"" }`

	expect("type Score = number", signature(declarations.Sourced_bestScore), "func(float64) shard_dependencies.EitherAny")
	expect("interface User", signature(declarations.Sourced_keepUser), "func("+user+") "+user)
	expect("interface Team", signature(declarations.Sourced_keepTeam), "func("+team+") "+team)
	expect("Team[] + map", signature(declarations.Sourced_users), "func([]"+team+") []"+team)
	expect("type Pair = tuple", signature(declarations.Sourced_pair), "func([]float64) []float64")

	// Affichage : les noms TS, comme dans Node.
	ada := struct {
		Sourced_name string  `json:"name"`
		Sourced_age  float64 `json:"age"`
	}{"ada", 36}
	expect("print interface User", shard.Inspect(declarations.Sourced_keepUser(ada)), "{ name: 'ada', age: 36 }")

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
