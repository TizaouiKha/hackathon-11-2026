// Test d'exécution de la phase 4 de D-18 : fonctions DString avec la sémantique
// de JavaScript (unités UTF-16, positions négatives, NaN, Infinity, casse
// complète). Les cas et leurs valeurs attendues sont générés depuis Node par
// tests/strings/generate.ts (check/cases.go). Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"
	"reflect"
	"strconv"

	stringsTs "duplojs.local/transpiled/strings.ts"
	shard "duplojs.local/transpiled/shard_dependencies"
)

type testCase struct {
	name string
	run  func() any
	want string
}

func render(value any) string {
	switch typed := value.(type) {
	case shard.JSUndefined:
		return "undefined"
	case string:
		return typed
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(typed)
	case shard.EitherAny:
		return "either:" + render(typed.Value)
	}
	return fmt.Sprintf("%#v", value)
}

func main() {
	failures := 0
	all := cases()
	for _, check := range all {
		got := render(check.run())
		if got != check.want {
			failures++
			if failures <= 40 {
				fmt.Printf("FAIL %s got=%q want=%q\n", check.name, got, check.want)
			}
		}
	}

	// Passée comme fonction : le helper lui-même, `func(string) float64`.
	lengthFunction := stringsTs.Sourced_lengthFunction()
	if reflect.TypeOf(lengthFunction).String() != "func(string) float64" || lengthFunction("😀") != 2 {
		failures++
		fmt.Println("FAIL lengthFunction")
	}

	// Passées comme fonctions : la casse complète reste appliquée.
	if stringsTs.Sourced_upperCaseFunction()("straße") != "STRASSE" || stringsTs.Sourced_lowerCaseFunction()("ΟΔΟΣ") != "οδος" {
		failures++
		fmt.Println("FAIL upperCaseFunction / lowerCaseFunction")
	}

	// Régression de la review : `at` sur une chaîne contrainte est une `string`
	// en TS ; le Go généré doit donc renvoyer `string` (et compiler).
	firstOfNonEmpty := stringsTs.Sourced_firstOfNonEmpty
	if reflect.TypeOf(firstOfNonEmpty).String() != "func(string) string" || firstOfNonEmpty("héllo") != "h" {
		failures++
		fmt.Println("FAIL firstOfNonEmpty")
	}

	fmt.Printf("%d cas, %d échec(s)\n", len(all)+3, failures)
	if failures > 0 {
		os.Exit(1)
	}
	fmt.Println("Tous les contrôles passent.")
}
