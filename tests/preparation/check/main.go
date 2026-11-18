package main

import (
	"fmt"
	"math"
	"os"

	preparation "duplojs.local/transpiled/preparation.ts"
	dependencies "duplojs.local/transpiled/shard_dependencies"
)

var failures int

func expect(name string, got, want any) {
	if got != want {
		fmt.Printf("FAIL %s : obtenu %v, attendu %v\n", name, got, want)
		failures++
		return
	}
	fmt.Println("OK  " + name)
}

func main() {
	expect("appels imbriqués", preparation.Sourced_nested(10, 3), 3.0)
	expect("division de deux littéraux", preparation.Sourced_half(), 0.5)
	expect("division par zéro", math.IsInf(preparation.Sourced_divideByZero(1), 1), true)
	expect("dépassement de capacité", math.IsInf(preparation.Sourced_overflow(), 1), true)

	success := dependencies.Either[float64]{Tag: dependencies.TagRightSuccess, Value: 2}
	fail := dependencies.Either[float64]{Tag: dependencies.TagLeftFail}
	// Ce tag ferait échouer matchInformation si le membre droit était exécuté.
	unhandled := dependencies.Either[float64]{Tag: 255}

	expect("false && ... ignore le membre droit", preparation.Sourced_both(false, unhandled), false)
	expect("true && ... lit le membre droit", preparation.Sourced_both(true, success), true)
	expect("true || ... ignore le membre droit", preparation.Sourced_either(true, unhandled), true)
	expect("false || ... lit le membre droit", preparation.Sourced_either(false, success), true)
	expect("false || fail passe dans le callback adapté", preparation.Sourced_either(false, fail), false)

	if failures > 0 {
		os.Exit(1)
	}
}
