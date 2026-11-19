// Test d'exécution de D-23 : DArray.reduce et ses outils (next, exit, nextPush).
// Valeurs attendues : celles de Node (tests/darray-reduce/reduce.ts avec tsx).
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"

	reduce "duplojs.local/transpiled/reduce.ts"
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
	fmt.Printf("%s %-17s %s\n", status, name, shown)
	if shown != want {
		fmt.Printf("     attendu : %s\n", want)
	}
}

func main() {
	expect("sum", reduce.Sourced_sum(), "10")
	expect("sumOfIndexes", reduce.Sourced_sumOfIndexes(), "6")
	expect("joined", reduce.Sourced_joined(), "abc")
	expect("exitSameType", reduce.Sourced_exitSameType(), "3")
	expect("exitOtherType", reduce.Sourced_exitOtherType(), "stop")
	expect("pushed", reduce.Sourced_pushed(), "[ '1', '2', '3', '4' ]")
	expect("curried", reduce.Sourced_curried(), "1234")
	expect("notDestructured", reduce.Sourced_notDestructured(), "10")
	expect("objectAccumulator", reduce.Sourced_objectAccumulator(), "{ count: 4, total: 10 }")
	expect("blockBody", reduce.Sourced_blockBody(), "3")

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
