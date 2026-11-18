// Test d'exécution de l'étape 7 (helpers du domaine Either, DECISIONS.md D-09.3).
// Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"os"

	helpers "duplojs.local/transpiled/helpers.ts"
)

var failures = 0

func expect(name string, got, want any) {
	status := "OK  "
	if fmt.Sprint(got) != fmt.Sprint(want) {
		status = "FAIL"
		failures++
	}
	fmt.Printf("%s %-40s got=%v want=%v\n", status, name, got, want)
}

func main() {
	success := helpers.Sourced_successOf(10)
	negative := helpers.Sourced_negativeOf(-3)
	fail := helpers.Sourced_failOf()

	// isRight
	expect("isRight(success)", helpers.Sourced_isRightOf(success), true)
	expect("isRight(left)", helpers.Sourced_isRightOf(negative), false)
	expect("isRight(fail)", helpers.Sourced_isRightOf(fail), false)

	// whenIsRightOtherwise
	expect("whenIsRightOtherwise(success): double", helpers.Sourced_rightOrOtherwise(success), 20)
	expect("whenIsRightOtherwise(left): minusOne", helpers.Sourced_rightOrOtherwise(negative), -1)
	expect("whenIsRightOtherwise(fail): minusOne", helpers.Sourced_rightOrOtherwise(fail), -1)
	expect("whenIsRightOtherwise Either2 (droite)", helpers.Sourced_either2RightOrOtherwise(helpers.Sourced_either2Right(5)), 1)
	expect("whenIsRightOtherwise Either2 (gauche)", helpers.Sourced_either2RightOrOtherwise(helpers.Sourced_either2Left(5)), -1)

	// matchInformation
	expect("matchInformation(success)", helpers.Sourced_match(success), 110)
	expect("matchInformation(negative-operand)", helpers.Sourced_match(negative), -103)
	expect("matchInformation(fail)", helpers.Sourced_match(fail), 0)

	// rightPipe
	halved := helpers.Sourced_pipeHalveTwice(success)
	expect("rightPipe(success, halve, halve): tag", halved.Tag.Information(), "success")
	expect("rightPipe(success, halve, halve): valeur", halved.Value, 2.5)

	stopped := helpers.Sourced_pipeRejectThenHalve(success)
	expect("rightPipe(success, reject, halve): tag", stopped.Tag.Information(), "negative-operand")
	expect("rightPipe(success, reject, halve): valeur", stopped.Value, 10)

	passThrough := helpers.Sourced_pipeHalveTwice(negative)
	expect("rightPipe(left, …): left inchangé", passThrough.Tag.Information(), "negative-operand")
	expect("rightPipe(left, …): valeur inchangée", passThrough.Value, -3)

	failThrough := helpers.Sourced_pipeHalveTwice(fail)
	expect("rightPipe(fail, …): fail inchangé", failThrough.Tag.Information(), "fail")

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Println("\nTous les contrôles passent.")
}
