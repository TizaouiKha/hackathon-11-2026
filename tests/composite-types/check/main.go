// Test d'exécution de tsTypeToGo, phase 3 de D-18 (DECISIONS.md D-18.3) :
// les signatures Go générées (lues par réflexion) suivent la table, et les
// valeurs composées traversent le Go transpilé sans conversion.
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"
	"reflect"
	"strconv"

	composite "duplojs.local/transpiled/composite.ts"
)

var failures = 0

func expect(name string, got, want any) {
	status := "OK  "
	if fmt.Sprint(got) != fmt.Sprint(want) {
		status = "FAIL"
		failures++
	}
	fmt.Printf("%s %-28s got=%q\n", status, name, fmt.Sprint(got))
}

func signature(function any) string {
	return reflect.TypeOf(function).String()
}

func main() {
	// Signatures.
	expect("number[]", signature(composite.Sourced_numbers), "func([]float64) []float64")
	expect("readonly string[]", signature(composite.Sourced_frozen), "func([]string) []string")
	expect("[number, number]", signature(composite.Sourced_pair), "func([]float64) []float64")
	expect("[string, number]", signature(composite.Sourced_mixed), "func([]interface {}) []interface {}")
	// Les tags `json:"<nom TS>"` font partie du type : `print` affiche le nom TS.
	userType := `struct { Sourced_name string "json:\"name\""; Sourced_age float64 "json:\"age\"" }`
	expect("{ name; age }", signature(composite.Sourced_user), "func("+userType+") "+userType)
	nestedType := `struct { Sourced_tags []string "json:\"tags\""; Sourced_owner struct { Sourced_id float64 "json:\"id\"" } "json:\"owner\"" }`
	expect("objet imbriqué", signature(composite.Sourced_nested), "func("+nestedType+") "+nestedType)
	expect("Record<string, number>", signature(composite.Sourced_dictionary), "func(map[string]float64) map[string]float64")
	expect("callback", signature(composite.Sourced_apply), "func(func(float64) string) string")
	expect("callback variadique void", signature(composite.Sourced_variadic), "func(func(...float64)) func(...float64)")
	expect("Promise<number>", signature(composite.Sourced_awaited), "func(float64) float64")
	expect("générique T", signature(composite.Sourced_generic), "func(interface {}) interface {}")
	expect("Success<number[]> | Fail", signature(composite.Sourced_listResult), "func([]float64) shard_dependencies.EitherAny")

	// Valeurs : les structs anonymes de même forme sont le même type en Go.
	ada := struct {
		Sourced_name string  `json:"name"`
		Sourced_age  float64 `json:"age"`
	}{"ada", 36}
	expect("objet aller-retour", composite.Sourced_user(ada) == ada, true)
	expect("tuple aller-retour", composite.Sourced_pair([]float64{1, 2}), "[1 2]")
	expect("map aller-retour", composite.Sourced_dictionary(map[string]float64{"a": 1})["a"], 1)
	expect("callback appelé", composite.Sourced_apply(func(value float64) string { return strconv.FormatFloat(value, 'f', -1, 64) }), "1")
	expect("Either de tableau", composite.Sourced_listResult([]float64{3, 4}).Value.([]float64), "[3 4]")

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
