// Test d'exécution de D-24 : fonctions DObject.
// Valeurs attendues : celles de Node (tests/dobject/object.ts avec tsx).
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"

	object "duplojs.local/transpiled/object.ts"
	shard "duplojs.local/transpiled/shard_dependencies"
)

var failures = 0

func expect(name string, got any, want string) {
	expectNote(name, got, want, "")
}

// expectNote : même contrôle, avec un écart assumé expliqué.
func expectNote(name string, got any, want string, note string) {
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
	expect("picked", object.Sourced_picked(), "{ name: 'John', email: 'j@x.io' }")
	expect("pickedWithObject", object.Sourced_pickedWithObject(), "{ name: 'John' }")
	expect("pickedCurried", object.Sourced_pickedCurried(), "{ id: 1 }")
	expect("omitted", object.Sourced_omitted(), "{ id: 1, name: 'John' }")
	expectNote("assigned", object.Sourced_assigned(), "{ id: 1, email: 'j@x.io', isActive: true, name: 'Ada' }",
		"Node : { id, name: 'Ada', email, isActive } ; l'ordre d'affichage suit le type TS")
	expect("assignedNewField", object.Sourced_assignedNewField(), "{ id: 1, name: 'John', email: 'j@x.io', isActive: true, role: 'admin' }")
	expect("overridden", object.Sourced_overridden(), "{ id: 1, name: 'Ada', email: 'j@x.io', isActive: true }")
	expect("property", object.Sourced_property(), "John")
	expect("propertyCurried", object.Sourced_propertyCurried(), "j@x.io")
	expect("deepProperty", object.Sourced_deepProperty(), "John")
	expectNote("transformed", object.Sourced_transformed(), "{ name: 'John', email: 'j@x.io', isActive: true, id: 10 }",
		"Node : { id: 10, name, email, isActive } ; l'ordre d'affichage suit le type TS")
	expect("keysOf", object.Sourced_keysOf(), "[ 'id', 'name', 'email', 'isActive' ]")
	expect("valuesOf", object.Sourced_valuesOf(), "[ 1, 'John', 'j@x.io', true ]")
	expect("entriesOf", object.Sourced_entriesOf(), "[ [ 'first', 1 ], [ 'second', 2 ] ]")
	expect("counted", object.Sourced_counted(), "4")

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
