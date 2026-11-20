// Traduction écrite à la main de exemple.ts : la représentation EitherAny.
package main

import (
	"fmt"
	"strconv"
)

// Un numéro par issue rencontrée dans le programme (1 octet).
type EitherTag uint8

const (
	TagRightSuccess EitherTag = iota
	TagLeftDivisionByZero
	TagLeftNegativeOperand
)

// Tables générées : le côté et le texte de chaque issue, retrouvés à partir du numéro.
var isRightTag = [...]bool{true, false, false}
var informationName = [...]string{"success", "division-by-zero", "negative-operand"}

type EitherAny struct {
	Tag   EitherTag
	Value any
}

// Les constructeurs sont des littéraux de struct : aucun appel à l'exécution.
func divide(dividend float64, divisor float64) EitherAny {
	if divisor == 0 {
		return EitherAny{Tag: TagLeftDivisionByZero, Value: dividend}
	}
	if dividend < 0 {
		return EitherAny{Tag: TagLeftNegativeOperand, Value: dividend}
	}
	return EitherAny{Tag: TagRightSuccess, Value: dividend / divisor}
}

func number(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

func describe(result EitherAny) string {
	// TypeScript sait que la valeur est un number : une simple assertion l'ouvre.
	if isRightTag[result.Tag] {
		return "succès : " + number(result.Value.(float64))
	}
	return "erreur " + informationName[result.Tag] + " (dividende " + number(result.Value.(float64)) + ")"
}

func main() {
	fmt.Println(describe(divide(10, 4)))
	fmt.Println(describe(divide(10, 0)))
	fmt.Println(describe(divide(-6, 3)))
}
