// Traduction écrite à la main de exemple.ts (noms simplifiés).
package main

import "fmt"

type EitherTag uint8

const TagRightSuccess EitherTag = 0

type EitherAny struct {
	Tag   EitherTag
	Value any
}

func classify(value float64) EitherAny {
	// Le ternaire devient une instruction préparatoire : une variable remplie par un if / else.
	var label string
	if value >= 0 {
		label = "positif"
	} else {
		label = "négatif"
	}

	// `ok` a été reconnu comme `success` par le checker : un Either de succès.
	return EitherAny{Tag: TagRightSuccess, Value: label}
}

func main() {
	result := classify(-3)

	if result.Tag == TagRightSuccess {
		fmt.Println("succès : " + result.Value.(string))
	} else {
		fmt.Println("erreur")
	}
}
