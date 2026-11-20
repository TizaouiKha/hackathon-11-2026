// Traduction écrite à la main de exemple.ts.
package main

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// Le second paramètre que DArray.map passe à son callback : { index, self }.
type MapParams = struct {
	Index float64   `json:"index"`
	Self  []float64 `json:"self"`
}

// Helpers écrits une fois (shared dependencies).
func Map(input []float64, theFunction func(float64, MapParams) float64) []float64 {
	output := make([]float64, len(input))
	for index, element := range input {
		output[index] = theFunction(element, MapParams{Index: float64(index), Self: input})
	}
	return output
}

func Filter(input []float64, predicate func(float64) bool) []float64 {
	output := make([]float64, 0, len(input))
	for _, element := range input {
		if predicate(element) {
			output = append(output, element)
		}
	}
	return output
}

// DNumber.isEven a son helper : passé en valeur, c'est simplement cette fonction.
func NumberIsEven(value float64) bool {
	return math.Mod(value, 2) == 0
}

// String(tableau) de JS : "10,20,30".
func joined(values []float64) string {
	parts := make([]string, len(values))
	for index, value := range values {
		parts[index] = strconv.FormatFloat(value, 'f', -1, 64)
	}
	return strings.Join(parts, ",")
}

func main() {
	double := func(value float64) float64 { return value * 2 }
	addTen := func(value float64) float64 { return value + 10 }

	// 1. pipe(5, double, addTen) est déroulé : une variable par étape.
	t1 := double(5)
	t2 := addTen(t1)
	fmt.Println("pipe : " + strconv.FormatFloat(t2, 'f', -1, 64))

	// 2. DArray.map(f) sans donnée devient une vraie fonction Go.
	timesTen := func(value float64, _ MapParams) float64 { return value * 10 }
	curried := func(input []float64) []float64 { return Map(input, timesTen) }
	fmt.Println("map curryfié : " + joined(curried([]float64{1, 2, 3})))

	// 3. Une fonction DuploJS passée en valeur.
	fmt.Println("filter + isEven : " + joined(Filter([]float64{1, 2, 3, 4}, NumberIsEven)))

	// 4. () => 0 ne déclare aucun paramètre : il est enveloppé dans la signature de Map.
	callback := func() float64 { return 0 }
	wrapped := func(_ float64, _ MapParams) float64 { return callback() }
	fmt.Println("callback sans paramètre : " + joined(Map([]float64{1, 2}, wrapped)))
}
