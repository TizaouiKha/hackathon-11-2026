package main

import (
	"fmt"
	"os"
	"reflect"

	language "duplojs.local/transpiled/language.ts"
)

var failures int

func expect(name string, got, want any) {
	if !reflect.DeepEqual(got, want) {
		fmt.Printf("FAIL %-34s got=%#v want=%#v\n", name, got, want)
		failures++
		return
	}
	fmt.Printf("OK   %s\n", name)
}

func main() {
	expect("const locale et if/else (large)", language.Sourced_localAndIf(4), "large")
	expect("const locale et if/else (small)", language.Sourced_localAndIf(1), "small")
	language.Sourced_emptyReturn(-1)
	language.Sourced_emptyReturn(1)
	expect("retour vide", true, true)
	expect("ternaire vrai", language.Sourced_choose(true), "yes")
	expect("ternaire faux", language.Sourced_choose(false), "no")
	expect("unaires ! et -", language.Sourced_unary(2, false), float64(-3))
	expect("unaire +", language.Sourced_unary(2, true), float64(2))
	expect("comparaisons/logique vrai", language.Sourced_logical(5), true)
	expect("comparaisons/logique faux", language.Sourced_logical(12), false)
	expect("flèche expression", language.Sourced_expressionArrow(4), float64(8))
	expect("flèche bloc", language.Sourced_blockArrow(4), float64(5))
	expect("tuple homogène déstructuré", language.Sourced_homogeneousTuple(2, 3), float64(5))
	expect("tuple hétérogène déstructuré", language.Sourced_heterogeneousTuple(7), float64(7))
	expect("littéral tableau", language.Sourced_values(), []float64{1, -2, 3})
	expect("littéral tuple hétérogène", language.Sourced_pair(), struct {
		V0 string
		V1 float64
	}{"answer", 42})
	expect("const module et tuples", language.Sourced_moduleTuples(), [][2]float64{{1, 2}, {3, 4}})

	if failures > 0 {
		os.Exit(1)
	}
}
