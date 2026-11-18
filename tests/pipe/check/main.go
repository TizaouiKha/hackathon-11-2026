// Test d'exécution de l'étape 8a : DCommon.pipe déroulé et formes curryfiées
// des helpers Either (DECISIONS.md D-10, D-17). Les valeurs attendues ont été
// obtenues en exécutant pipes.ts avec tsx (DuploJS réel).
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"

	pipes "duplojs.local/transpiled/pipes.ts"
)

var failures = 0

func expect(name string, got, want any) {
	status := "OK  "
	if fmt.Sprint(got) != fmt.Sprint(want) {
		status = "FAIL"
		failures++
	}
	fmt.Printf("%s %-42s got=%v want=%v\n", status, name, got, want)
}

func main() {
	success := pipes.Sourced_successOf(10)
	negative := pipes.Sourced_negativeOf(-3)
	fail := pipes.Sourced_failOf()

	expect("pipe(4, double, addTen)", pipes.Sourced_plainPipe(4), 18)

	raw := pipes.Sourced_pipeWhenIsRight(success)
	expect("pipe(success, whenIsRight(double)): tag", raw.Tag.Information(), "value")
	expect("pipe(success, whenIsRight(double)): valeur", raw.Value, 20)
	leftKept := pipes.Sourced_pipeWhenIsRight(negative)
	expect("pipe(left, whenIsRight(double)): tag", leftKept.Tag.Information(), "negative-operand")
	expect("pipe(left, whenIsRight(double)): valeur", leftKept.Value, -3)
	expect("pipe(fail, whenIsRight(double)): tag", pipes.Sourced_pipeWhenIsRight(fail).Tag.Information(), "fail")

	expect("pipe(success, otherwise, addTen)", pipes.Sourced_pipeOtherwise(success), 30)
	expect("pipe(left, otherwise, addTen)", pipes.Sourced_pipeOtherwise(negative), 9)
	expect("pipe(fail, otherwise, addTen)", pipes.Sourced_pipeOtherwise(fail), 9)

	// La valeur brute produite par whenIsRight n'est pas un Right (comme en DuploJS).
	expect("pipe(success, whenIsRight, otherwise)", pipes.Sourced_pipeChain(success), -1)
	expect("pipe(left, whenIsRight, otherwise)", pipes.Sourced_pipeChain(negative), -1)
	expect("pipe(fail, whenIsRight, otherwise)", pipes.Sourced_pipeChain(fail), -1)

	expect("pipe(success, matchInformation)", pipes.Sourced_pipeMatch(success), 20)
	expect("pipe(left, matchInformation)", pipes.Sourced_pipeMatch(negative), 7)
	expect("pipe(fail, matchInformation)", pipes.Sourced_pipeMatch(fail), -1)

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
