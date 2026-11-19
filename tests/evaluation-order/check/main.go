// Test d'exécution de R-01 n° 2 : l'ordre d'évaluation des opérandes.
// Valeurs attendues : celles de Node (tests/evaluation-order/order.ts avec tsx).
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"

	order "duplojs.local/transpiled/order.ts"
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
	fmt.Printf("%s %-18s %s\n", status, name, shown)
	if shown != want {
		fmt.Printf("     attendu : %s\n", want)
	}
}

func main() {
	expect("callArguments", order.Sourced_callArguments(), "[ 1, 0 ]")
	expect("binaryOperands", order.Sourced_binaryOperands(), "1")
	expect("arrayElements", order.Sourced_arrayElements(), "[ 1, 0 ]")
	expect("objectValues", order.Sourced_objectValues(), "{ first: 1, second: 0 }")
	expect("shorthandValue", order.Sourced_shorthandValue(), "{ shared: 1, second: 0 }")
	expect("objectCallOrder", order.Sourced_objectCallOrder(), "ab:ab")
	expect("capturedParameter", order.Sourced_capturedParameter(1), "1")
	expect("constantOperand", order.Sourced_constantOperand(), "3")
	expect("templateParts", order.Sourced_templateParts(), "1:0")

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
