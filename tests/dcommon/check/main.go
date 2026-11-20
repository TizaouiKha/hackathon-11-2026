// Test d'exécution de D-26 : fonctions DCommon de base.
// Valeurs attendues : celles de Node (tests/dcommon/common.ts avec tsx).
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"

	common "duplojs.local/transpiled/common.ts"
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
	fmt.Printf("%s %-14s %s\n", status, name, shown)
	if shown != want {
		fmt.Printf("     attendu : %s\n", want)
	}
}

func main() {
	expect("conditionals", common.Sourced_conditionals(), "[ 10, 1, 2, 6 ]")
	expect("otherwise", common.Sourced_otherwise(), "[ 'big', 'small' ]")
	expect("mixedResult", common.Sourced_mixedResult(), "n=5")
	expect("equality", common.Sourced_equality(), "[ true, true, false ]")
	expect("equalAsFilter", common.Sourced_equalAsFilter(), "[ 'a', 'c' ]")
	expect("logical", common.Sourced_logical(), "[ true, false, true ]")
	expect("tapped", common.Sourced_tapped(), "5:[5]")
	expect("truthiness", common.Sourced_truthiness(), "[ false, false, true, true, false ]")
	expect("truthyFilter", common.Sourced_truthyFilter(), "[ 1, 2 ]")
	expect("types", common.Sourced_types(), "[ true, false, true ]")
	expect("executed", common.Sourced_executed(), "42")
	expect("constantMap", common.Sourced_constantMap(), "[ 0, 0, 0 ]")
	expect("forwarded", common.Sourced_forwarded(), "5")

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
