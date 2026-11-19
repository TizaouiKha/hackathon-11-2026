// Test d'exécution de la phase 2 de D-18 : élargissement vers un Either,
// isLeft et unwrapRight (appel, valeur dans un pipe, entrée brute).
// Valeurs attendues obtenues en exécutant narrowing.ts avec tsx.
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"

	narrowing "duplojs.local/transpiled/narrowing.ts"
	shard "duplojs.local/transpiled/shard_dependencies"
)

var failures = 0

func expect(name string, got, want any) {
	status := "OK  "
	if fmt.Sprint(got) != fmt.Sprint(want) {
		status = "FAIL"
		failures++
	}
	fmt.Printf("%s %-32s got=%q\n", status, name, fmt.Sprint(got))
}

// Même rendu que le script Node : valeur brute (TagValue) ou Either.
func show(value shard.EitherAny) string {
	if value.Tag == shard.TagValue {
		return fmt.Sprintf("raw:%v", value.Value)
	}
	inner := fmt.Sprint(value.Value)
	if _, isUndefined := value.Value.(shard.JSUndefined); isUndefined {
		inner = "undefined"
	}
	return fmt.Sprintf("either:%s:%s", value.Tag.Information(), inner)
}

func main() {
	expect("widened(4)", show(narrowing.Sourced_widened(4)), "raw:4")
	expect("widenedArgument(4)", narrowing.Sourced_widenedArgument(4), false)
	expect("leftCheck(failed)", narrowing.Sourced_leftCheck(narrowing.Sourced_failed()), true)
	expect("leftCheck(succeeded)", narrowing.Sourced_leftCheck(narrowing.Sourced_succeeded(2)), false)
	expect("rightCheck(widened)", narrowing.Sourced_rightCheck(narrowing.Sourced_widened(2)), false)
	expect("unwrapped(succeeded 5)", show(narrowing.Sourced_unwrapped(narrowing.Sourced_succeeded(5))), "raw:5")
	expect("unwrapped(failed)", show(narrowing.Sourced_unwrapped(narrowing.Sourced_failed())), "either:fail:undefined")
	expect("unwrappedSuccess(7)", narrowing.Sourced_unwrappedSuccess(narrowing.Sourced_onlySuccess(7)), 8)
	expect("unwrappedRaw(3)", narrowing.Sourced_unwrappedRaw(3), 3)
	expect("piped(succeeded 6)", show(narrowing.Sourced_piped(narrowing.Sourced_succeeded(6))), "raw:6")
	expect("pipedLeftCheck(failed)", narrowing.Sourced_pipedLeftCheck(narrowing.Sourced_failed()), true)
	expect("pipedLeftCheck(succeeded)", narrowing.Sourced_pipedLeftCheck(narrowing.Sourced_succeeded(1)), false)

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
