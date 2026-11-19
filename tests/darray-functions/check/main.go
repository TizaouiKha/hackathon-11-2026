// Test d'exécution du lot DArray (étape 12) : filter, find, findIndex, some,
// every, includes, push, concat, length.
// Valeurs attendues : celles de Node (tests/darray-functions/list.ts avec tsx).
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"

	list "duplojs.local/transpiled/list.ts"
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
	expect("filterEven", list.Sourced_filterEven(), "[ 2, 4 ]")
	expect("filterWithIndex", list.Sourced_filterWithIndex(), "[ 3, 4 ]")
	expect("filterCurried", list.Sourced_filterCurried(), "[ 3, 4 ]")
	expect("activeNames", list.Sourced_activeNames(), "[ 'Ada', 'Cy' ]")
	expect("findFound", list.Sourced_findFound(), "3")
	expect("findMissing", list.Sourced_findMissing(), "undefined")
	expect("findUser", list.Sourced_findUser(), "{ name: 'Bob', isActive: false }")
	expect("findIndexFound", list.Sourced_findIndexFound(), "2")
	expect("findIndexMissing", list.Sourced_findIndexMissing(), "undefined")
	expect("someAndEvery", list.Sourced_someAndEvery(), "[ true, false, true, false ]")
	expect("includesValues", list.Sourced_includesValues(), "[ true, false, true, true, true ]")
	expect("pushCopies", list.Sourced_pushCopies(), "[ [ 1, 2, 3, 4 ], [ 1, 2, 3, 4, 5, 6 ] ]")
	expect("concatLists", list.Sourced_concatLists(), "[ 1, 2, 3, 4, 5 ]")
	expect("lengths", list.Sourced_lengths(), "[ 4, 3 ]")

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
