// Test d'exécution de tsTypeToGo et d'EitherAny (DECISIONS.md D-18, phase 1).
// 1. Les signatures Go générées (lues par réflexion) suivent la table de tsTypeToGo.
// 2. Les issues du code du prof s'affichent exactement comme dans Node (util.inspect,
//    valeurs attendues obtenues en exécutant types.ts avec tsx).
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"
	"reflect"

	types "duplojs.local/transpiled/types.ts"
	shard "duplojs.local/transpiled/shard_dependencies"
)

var failures = 0

func expect(name string, got, want any) {
	status := "OK  "
	if fmt.Sprint(got) != fmt.Sprint(want) {
		status = "FAIL"
		failures++
	}
	fmt.Printf("%s %-48s got=%q\n", status, name, fmt.Sprint(got))
}

func signature(function any) string {
	return reflect.TypeOf(function).String()
}

func main() {
	// Types primitifs.
	expect("number & Positive -> float64", signature(types.Sourced_brandedNumber), "func(float64) float64")
	expect(`"a" | "b" -> string`, signature(types.Sourced_literalUnion), "func(string) string")
	expect("boolean -> bool", signature(types.Sourced_flag), "func(bool) bool")
	expect("null -> JSNull", signature(types.Sourced_nothing), "func(shard_dependencies.JSNull) shard_dependencies.JSNull")
	expect("undefined -> JSUndefined", signature(types.Sourced_missing), "func(shard_dependencies.JSUndefined) shard_dependencies.JSUndefined")
	expect("string | number -> any", signature(types.Sourced_rawUnion), "func(interface {}) interface {}")

	// Unions d'Either : toujours EitherAny, quel que soit le nombre d'issues.
	expect("union du prof -> EitherAny", signature(types.Sourced_mustNotContainNumber), "func() shard_dependencies.EitherAny")
	expect("Right<info> | Error<null> -> EitherAny", signature(types.Sourced_validUsername), "func(string) shard_dependencies.EitherAny")

	// Valeurs : n'importe quel type dans Value, ouvert par assertion quand on le connaît.
	length := types.Sourced_positiveLength(4)
	expect("success: valeur float64", length.Value.(float64), 4)
	expect("error(null): valeur JSNull", fmt.Sprintf("%T", types.Sourced_errorNull().Value), "shard_dependencies.JSNull")
	expect("right(\"valid-username\"): valeur string", types.Sourced_validUsername("ada").Value.(string), "ada")

	// Affichage identique à Node.
	inspected := []struct {
		name string
		got  string
		want string
	}{
		{"print left sans valeur", shard.Inspect(types.Sourced_mustNotContainNumber()), "{\n  '@duplojs/lang/kind/@DuplojsLangEither/left': null,\n  '@duplojs/lang/kind/@DuplojsLangEither/information': 'must-be-not-contain-number',\n  '@duplojs/lang/kind/@DuplojsLangEither/value': undefined\n}"},
		{"print error(null)", shard.Inspect(types.Sourced_errorNull()), "{\n  '@duplojs/lang/kind/@DuplojsLangEither/left': null,\n  '@duplojs/lang/kind/@DuplojsLangEither/information': 'error',\n  '@duplojs/lang/kind/@DuplojsLangEither/value': null,\n  '@duplojs/lang/kind/@DuplojsLangEither/error': null\n}"},
		{"print success(4)", shard.Inspect(length), "{\n  '@duplojs/lang/kind/@DuplojsLangEither/right': null,\n  '@duplojs/lang/kind/@DuplojsLangEither/information': 'success',\n  '@duplojs/lang/kind/@DuplojsLangEither/value': 4,\n  '@duplojs/lang/kind/@DuplojsLangEither/success': null\n}"},
		{"print right(\"valid-username\")", shard.Inspect(types.Sourced_validUsername("ada")), "{\n  '@duplojs/lang/kind/@DuplojsLangEither/right': null,\n  '@duplojs/lang/kind/@DuplojsLangEither/information': 'valid-username',\n  '@duplojs/lang/kind/@DuplojsLangEither/value': 'ada'\n}"},
	}

	for _, check := range inspected {
		expect(check.name, check.got, check.want)
	}

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
