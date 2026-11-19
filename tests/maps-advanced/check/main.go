// Test d'exécution : cas de DArray.map plus durs que tests/arrays (helper Either
// curryfié comme callback, map qui produit des Either, rightPipe dans le callback,
// map imbriqués, tableaux d'objets, callback générique, tuple hétérogène).
// Chaque résultat est affiché avec Inspect (ce que fait DCommon.print) et comparé,
// caractère pour caractère, à util.inspect de Node sur le même code (tsx).
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"

	maps "duplojs.local/transpiled/maps.ts"
	shard "duplojs.local/transpiled/shard_dependencies"
)

type user = struct {
	Sourced_name string  `json:"name"`
	Sourced_age  float64 `json:"age"`
}

func main() {
	results := []shard.EitherAny{maps.Sourced_makeSuccess(3), maps.Sourced_makeFail(), maps.Sourced_makeSuccess(0.5)}
	checks := []struct {
		name string
		got  string
		want string
	}{
		{"describeAll", shard.Inspect(maps.Sourced_describeAll(results)), "[ '3', '0', '0.5' ]"},
		{"describeAllPiped", shard.Inspect(maps.Sourced_describeAllPiped(results)), "[ '3', '0', '0.5' ]"},
		{"successes", shard.Inspect(maps.Sourced_successes([]float64{1, 2})), "[\n  {\n    '@duplojs/lang/kind/@DuplojsLangEither/right': null,\n    '@duplojs/lang/kind/@DuplojsLangEither/information': 'success',\n    '@duplojs/lang/kind/@DuplojsLangEither/value': 1,\n    '@duplojs/lang/kind/@DuplojsLangEither/success': null\n  },\n  {\n    '@duplojs/lang/kind/@DuplojsLangEither/right': null,\n    '@duplojs/lang/kind/@DuplojsLangEither/information': 'success',\n    '@duplojs/lang/kind/@DuplojsLangEither/value': 2,\n    '@duplojs/lang/kind/@DuplojsLangEither/success': null\n  }\n]"},
		{"chained", shard.Inspect(maps.Sourced_chained([]float64{4, 3})), "[\n  {\n    '@duplojs/lang/kind/@DuplojsLangEither/right': null,\n    '@duplojs/lang/kind/@DuplojsLangEither/information': 'success',\n    '@duplojs/lang/kind/@DuplojsLangEither/value': 2,\n    '@duplojs/lang/kind/@DuplojsLangEither/success': null\n  },\n  {\n    '@duplojs/lang/kind/@DuplojsLangEither/right': null,\n    '@duplojs/lang/kind/@DuplojsLangEither/information': 'success',\n    '@duplojs/lang/kind/@DuplojsLangEither/value': 1.5,\n    '@duplojs/lang/kind/@DuplojsLangEither/success': null\n  }\n]"},
		{"nested", shard.Inspect(maps.Sourced_nested([][]float64{{1, 2}, {}, {3}})), "[ [ 2, 4 ], [], [ 6 ] ]"},
		{"nestedTexts", shard.Inspect(maps.Sourced_nestedTexts([][]float64{{1, 0.5}, {1e21}})), "[ [ '1', '0.5' ], [ '1e+21' ] ]"},
		{"users", shard.Inspect(maps.Sourced_users([]user{{"ada", 36}, {"bob", 7}})), "[ { name: 'ada', age: 36 }, { name: 'bob', age: 7 } ]"},
		{"generic", shard.Inspect(maps.Sourced_generic([]float64{5, 6})), "[ 5, 6 ]"},
		{"mixedTuple", shard.Inspect(maps.Sourced_mixedTuple([]any{"a", float64(1)})), "[ 'a', 1 ]"},
	}

	failures := 0
	for _, check := range checks {
		status := "OK  "
		if check.got != check.want {
			status = "FAIL"
			failures++
		}
		fmt.Printf("%s %s\n", status, check.name)
		if check.got != check.want {
			fmt.Printf("  got:\n%s\n  want:\n%s\n", check.got, check.want)
		}
	}
	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
