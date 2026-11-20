// Traduction écrite à la main de exemple.ts : chaque piège de JavaScript est reproduit.
package main

import (
	"fmt"
	"math"
	"strconv"
	"unicode/utf16"
)

// jsNumber : une version courte de JSNumberToString (String(x) de JavaScript).
// La version complète du transpileur suit l'algorithme ECMAScript, 1e-7 compris.
func jsNumber(value float64) string {
	switch {
	case math.IsNaN(value):
		return "NaN"
	case math.IsInf(value, 1):
		return "Infinity"
	case math.IsInf(value, -1):
		return "-Infinity"
	case value == 0:
		return "0" // String(-0) vaut "0"
	case math.Abs(value) >= 1e21:
		return strconv.FormatFloat(value, 'e', -1, 64) // 1e+21, comme JS
	}
	return strconv.FormatFloat(value, 'f', -1, 64)
}

// Math.round de JS : arrondit .5 vers +Infinity (Go s'éloigne de zéro).
func jsRound(value float64) float64 {
	return math.Floor(value + 0.5)
}

// ToInt32 de JS : les opérateurs bit à bit travaillent en entiers 32 bits signés.
func jsToInt32(value float64) float64 {
	return float64(int32(int64(value)))
}

// .length de JS : des unités UTF-16, pas des octets UTF-8.
func jsLength(text string) float64 {
	return float64(len(utf16.Encode([]rune(text))))
}

func main() {
	zero := 0.0 // une variable : Go refuse 1 / 0 entre constantes
	big := math.Pow(2, 31)

	// Piège : entre constantes, Go calcule 0.1+0.2 en précision exacte (0.3).
	// Le transpileur force des float64, comme JS : 0.30000000000000004.
	fmt.Println("0.1 + 0.2 = " + jsNumber(float64(0.1)+float64(0.2)))
	fmt.Println("-7 % 3 = " + jsNumber(math.Mod(-7, 3)))
	fmt.Println("Math.round(-2.5) = " + jsNumber(jsRound(-2.5)))
	fmt.Println("1e21 = " + jsNumber(1e21))
	fmt.Println("-0 = " + jsNumber(math.Copysign(0, -1)))
	fmt.Println("1 / 0 = " + jsNumber(1/zero))
	fmt.Println("2 ** 31 | 0 = " + jsNumber(jsToInt32(big)))
	fmt.Println("\"é\".length = " + jsNumber(jsLength("é")))
	fmt.Println("\"😀\".length = " + jsNumber(jsLength("😀")))
}
