// Traduction écrite à la main de exemple.ts : l'adaptateur insère une assertion
// là où TypeScript a rétréci le type.
package main

import (
	"fmt"
	"strconv"
)

type EitherTag uint8

const (
	TagRightSuccess EitherTag = iota
	TagLeftNegative
)

type EitherAny struct {
	Tag   EitherTag
	Value any
}

// JSUndefined : la valeur `undefined` de JavaScript.
type JSUndefined struct{}

func double(value any) string {
	if _, isNumber := value.(float64); isNumber {
		// Ici TS sait que value est un number : produit any, rétréci number -> assertion.
		return strconv.FormatFloat(value.(float64)*2, 'f', -1, 64)
	}
	return value.(string) + value.(string)
}

func check(amount float64) EitherAny {
	if amount < 0 {
		return EitherAny{Tag: TagLeftNegative, Value: amount}
	}
	return EitherAny{Tag: TagRightSuccess, Value: amount}
}

func report(amount float64) string {
	result := check(amount)
	if result.Tag == TagLeftNegative {
		return "refusé"
	}
	// Après isLeft, TS sait que c'est un succès portant un number : on ouvre la boîte.
	return "accepté : " + strconv.FormatFloat(result.Value.(float64)+1, 'f', -1, 64)
}

// string | undefined -> any ; `??` ne prend la valeur par défaut que pour null / undefined.
func nameOrDefault(name any) string {
	if name == (JSUndefined{}) {
		return "anonyme"
	}
	return name.(string)
}

func main() {
	fmt.Println(double(21.0))
	fmt.Println(double("ab"))
	fmt.Println(report(-5))
	fmt.Println(report(41))
	fmt.Println(nameOrDefault(JSUndefined{}))
	fmt.Println(nameOrDefault("Ada"))
}
