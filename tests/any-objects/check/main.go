// Test d'exécution de D-20 : un objet `any` (construit sans son interface)
// utilisé comme objet typé, et les propriétés lues sur un `any`.
// Valeurs attendues : celles de Node (tests/any-objects/users.ts exécuté avec
// tsx), sauf trois écarts documentés, qui viennent de la forme fixe d'un struct :
//   - un champ en trop est perdu ;
//   - l'ordre d'affichage suit le type TS, pas l'ordre d'écriture de l'objet ;
//   - un champ du mauvais type arrête le programme avec un message clair.
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"
	"strings"

	users "duplojs.local/transpiled/users.ts"
	shard "duplojs.local/transpiled/shard_dependencies"
)

var failures = 0

// run renvoie l'affichage (comme DCommon.print) ou le message du plantage.
func run(function func() any) (shown string) {
	defer func() {
		if failure := recover(); failure != nil {
			shown = fmt.Sprint("PLANTAGE : ", failure)
		}
	}()
	return shard.Inspect(function())
}

func expect(name string, got, want, note string) {
	status := "OK  "
	if got != want {
		status = "FAIL"
		failures++
	}
	fmt.Printf("%s %-18s %s\n", status, name, got)
	if note != "" {
		fmt.Printf("     %-18s (%s)\n", "", note)
	}
	if got != want {
		fmt.Printf("     attendu : %s\n", want)
	}
}

func main() {
	ada := "{ name: 'ada', age: 36 }"

	expect("typedUser", run(func() any { return users.Sourced_typedUser() }), ada, "")
	expect("untypedSameOrder", run(func() any { return users.Sourced_untypedSameOrder() }), ada, "")
	expect("untypedOtherOrder", run(func() any { return users.Sourced_untypedOtherOrder() }), ada,
		"Node : { age: 36, name: 'ada' } ; même contenu, ordre du type User")
	expect("untypedExtraField", run(func() any { return users.Sourced_untypedExtraField() }), ada,
		"Node garde admin: true ; un struct User n'a pas de case pour lui")

	wrongType := run(func() any { return users.Sourced_untypedWrongType() })
	expect("untypedWrongType", wrongType, "PLANTAGE : JSAs : valeur.age est un string, float64 attendu",
		"Node : { name: 'ada', age: '36' } ; une case float64 ne peut pas contenir de texte")

	expect("readName", run(func() any { return users.Sourced_readName() }), "ada", "")
	expect("readMissing", run(func() any { return users.Sourced_readMissing() }), "undefined", "")
	expect("readLength", run(func() any { return users.Sourced_readLength() }), "3", "")
	expect("untypedList", run(func() any { return users.Sourced_untypedList() }),
		"[ { name: 'ada', age: 36 }, { name: 'bob', age: 7 } ]",
		"Node : { age: 7, name: 'bob' } pour le second ; ordre du type User")
	expect("missingOptional", run(func() any { return users.Sourced_missingOptional() }), "{ name: 'ada' }", "")
	expect("flags", run(func() any { return users.Sourced_flags() }), "[ true, false ]", "")

	if !strings.HasPrefix(wrongType, "PLANTAGE") {
		failures++
	}
	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
