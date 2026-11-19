package main

import (
	"fmt"
	"math"
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
	expect("unaire ~ positif", language.Sourced_bitwiseNot(5), float64(-6))
	expect("unaire ~ négatif", language.Sourced_bitwiseNot(-1), float64(0))
	expect("unaire ~ fraction", language.Sourced_bitwiseNot(1.9), float64(-2))
	expect("unaire ~ NaN", language.Sourced_bitwiseNot(math.NaN()), float64(-1))
	expect("comparaisons/logique vrai", language.Sourced_logical(5), true)
	expect("comparaisons/logique faux", language.Sourced_logical(12), false)
	expect("!nombre zéro", language.Sourced_numericNot(0), true)
	expect("!nombre NaN", language.Sourced_numericNot(math.NaN()), true)
	expect("!nombre non nul", language.Sourced_numericNot(-2), false)
	expect("if nombre zéro", language.Sourced_numericCondition(0), "falsy")
	expect("if nombre NaN", language.Sourced_numericCondition(math.NaN()), "falsy")
	expect("if nombre non nul", language.Sourced_numericCondition(-2), "truthy")
	expect("ternaire nombre zéro", language.Sourced_numericTernary(0), "falsy")
	expect("ternaire nombre non nul", language.Sourced_numericTernary(2), "truthy")
	expect("variable locale inutilisée", language.Sourced_unusedLocal(), float64(2))
	expect("flèche expression", language.Sourced_expressionArrow(4), float64(8))
	expect("flèche bloc", language.Sourced_blockArrow(4), float64(5))
	var callbackValue float64
	language.Sourced_voidExpressionArrow(func(value float64) {
		callbackValue = value
	})
	expect("flèche expression void", callbackValue, float64(7))
	expect("tuple ombragé branche vraie", language.Sourced_shadowedTuple(true), float64(1))
	expect("tuple ombragé branche fausse", language.Sourced_shadowedTuple(false), float64(0))
	expect("tuple homogène déstructuré", language.Sourced_homogeneousTuple(2, 3), float64(5))
	expect("tuple hétérogène déstructuré", language.Sourced_heterogeneousTuple(7), float64(7))
	expect("littéral tableau", language.Sourced_values(), []float64{1, -2, 3})
	// Depuis D-18.5, un tuple est une slice : `[]any` s'il est hétérogène, `[]T` sinon.
	expect("littéral tuple hétérogène", language.Sourced_pair(), []any{"answer", float64(42)})
	expect("const module et tuples", language.Sourced_moduleTuples(), [][]float64{{1, 2}, {3, 4}})

	if failures > 0 {
		os.Exit(1)
	}
}
