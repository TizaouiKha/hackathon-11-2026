// Test d'exécution de l'étape 8b : DArray.map et DArray.coalescing, formes avec
// données, curryfiée et passée comme fonction, dont les formes exactes des
// projets 02 et 05 à 07. Valeurs attendues obtenues en exécutant arrays.ts avec tsx.
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"

	arrays "duplojs.local/transpiled/arrays.ts"
	shard "duplojs.local/transpiled/shard_dependencies"
)

var failures = 0

// Même rendu que JSON.stringify pour les tableaux de nombres et de chaînes.
func show(value any) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}

func expect(name string, got, want string) {
	status := "OK  "
	if got != want {
		status = "FAIL"
		failures++
	}
	fmt.Printf("%s %-28s got=%s\n", status, name, got)
}

func main() {
	success := arrays.Sourced_makeSuccess(3)
	fail := arrays.Sourced_makeFail()

	expect("doubled", show(arrays.Sourced_doubled([]float64{1, 2.5, -3})), `[2,5,-6]`)
	expect("readonlyDoubled", show(arrays.Sourced_readonlyDoubled([]float64{4})), `[8]`)
	expect("texts (DString.to)", show(arrays.Sourced_texts([]float64{1, 0.5, 1e21, 0})), `["1","0.5","1e+21","0"]`)
	expect("pairTexts (tuple)", show(arrays.Sourced_pairTexts([]float64{3, 4})), `["3","4"]`)
	expect("curriedTexts (pipe)", show(arrays.Sourced_curriedTexts([]float64{7, 8})), `["7","8"]`)
	expect("wrapped", show(arrays.Sourced_wrapped(5)), `[5]`)
	expect("kept", show(arrays.Sourced_kept([]float64{1, 2})), `[1,2]`)
	expect("keptPair", show(arrays.Sourced_keptPair([]float64{1, 2})), `[1,2]`)

	// Projet 02 : le résultat right est rangé brut (TagValue), comme DuploJS.
	project02 := arrays.Sourced_project02(success)
	expect("project02 success", show(project02.Value), `[3]`)
	expect("project02 success est brut", fmt.Sprint(project02.Tag == shard.TagValue), "true")
	expect("project02 fail", project02Fail(arrays.Sourced_project02(fail)), "fail")

	// Projets 05 à 07 : `readonly [number] | readonly number[]` est une seule slice Go.
	expect("project05 success", show(arrays.Sourced_project05(success)), `["3"]`)
	expect("project05 fail", show(arrays.Sourced_project05(fail)), `["12"]`)
	expect("project05 signature", reflect.TypeOf(arrays.Sourced_project05).String(), "func(shard_dependencies.EitherAny) []string")

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}

func project02Fail(value shard.EitherAny) string {
	return value.Tag.Information()
}
