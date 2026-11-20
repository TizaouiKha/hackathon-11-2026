// Traduction écrite à la main de exemple.ts : exécution synchrone.
package main

import (
	"fmt"
	"strconv"
	"unicode/utf16"
)

// Promise<number> -> float64 : la valeur est déjà prête.
func fetchPrice(name string) float64 {
	return float64(len(utf16.Encode([]rune(name)))) * 2
}

// async function -> une fonction ordinaire ; `await x` -> `x`.
func total(names []string) float64 {
	sum := 0.0
	for _, name := range names {
		fmt.Println("prix de " + name)
		sum += fetchPrice(name)
	}
	return sum
}

func main() {
	fmt.Println("début")
	fmt.Println("total = " + strconv.FormatFloat(total([]string{"stylo", "cahier"}), 'f', -1, 64))
	fmt.Println("fin")
}
