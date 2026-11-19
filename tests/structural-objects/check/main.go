// Test d'exécution de D-21 : l'objet temporaire, quand un objet « plus grand »
// est passé là où un type d'objet plus petit est attendu.
// Valeurs attendues : celles de Node (tests/structural-objects/objects.ts avec
// tsx), sauf un écart documenté : un objet renvoyé ou affiché sous le type plus
// petit n'a plus que les champs de ce type (JS garde l'objet complet).
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"

	objects "duplojs.local/transpiled/objects.ts"
	shard "duplojs.local/transpiled/shard_dependencies"
)

var failures = 0

func expect(name string, got any, want string, note string) {
	shown := shard.Inspect(got)
	status := "OK  "
	if shown != want {
		status = "FAIL"
		failures++
	}
	fmt.Printf("%s %-15s %s\n", status, name, shown)
	if note != "" {
		fmt.Printf("     %-15s (%s)\n", "", note)
	}
	if shown != want {
		fmt.Printf("     attendu : %s\n", want)
	}
}

func main() {
	expect("professorCase", objects.Sourced_professorCase(), "John Doe", "")
	expect("nested", objects.Sourced_nested(), "John Doe", "")
	expect("list", objects.Sourced_list(), "[ 'John Doe', 'Ada' ]", "")
	expect("evaluatedOnce", objects.Sourced_evaluatedOnce(), "1", "makeUser() appelé une seule fois")
	expect("optional", objects.Sourced_optional(), "{ name: 'John Doe' }",
		"Node : l'objet complet { id, name, email, isActive } ; Go : les champs du type attendu")
	expect("narrowedReturn", objects.Sourced_narrowedReturn(), "{ name: 'John Doe' }",
		"Node : l'objet complet ; Go : seulement name, le type de retour déclaré")
	expect("destructured", objects.Sourced_destructured(), "John Doe#1", "")

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
