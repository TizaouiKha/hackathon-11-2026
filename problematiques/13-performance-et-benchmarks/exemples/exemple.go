// Traduction écrite à la main de exemple.ts : ce que le banc de l'étape 11 mesure.
package main

import (
	"fmt"
	"math"
	"strconv"
)

type EitherTag uint8

const (
	TagRightSuccess EitherTag = iota
	TagLeftOdd
)

type EitherAny struct {
	Tag   EitherTag
	Value any // ranger un float64 ici coûte une allocation (~21 ns) : le vrai coût mesuré
}

// IsRight est inliné par le compilateur Go (vérifié avec -gcflags=-m=2).
func (tag EitherTag) IsRight() bool {
	return tag == TagRightSuccess
}

func compute(iterations float64) float64 {
	total := 0.0
	for index := 0.0; index < iterations; index += 1 {
		var result EitherAny
		if math.Mod(index, 2) == 0 {
			result = EitherAny{Tag: TagRightSuccess, Value: index}
		} else {
			result = EitherAny{Tag: TagLeftOdd, Value: index}
		}

		if result.Tag.IsRight() {
			total += result.Value.(float64) // ~1,4 ns, sans allocation
		}
	}
	return total
}

func main() {
	fmt.Println("total = " + strconv.FormatFloat(compute(100_000), 'f', -1, 64))
}
