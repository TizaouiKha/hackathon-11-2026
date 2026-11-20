// Traduction écrite à la main de exemple.ts : ce que tsTypeToGo choisit pour chaque type.
package main

import (
	"fmt"
	"strconv"
)

// Un objet devient un struct anonyme ; le tag garde le nom TypeScript du champ.
type Product = struct {
	Name  string   `json:"name"`
	Price float64  `json:"price"` // number -> float64
	Tags  []string `json:"tags"`  // string[] -> []string
}

// Un tuple mixte [string, number] devient une slice []any.
func line(product Product) []any {
	return []any{product.Name, product.Price}
}

func main() {
	// Record<string, Product> -> map[string]Product
	catalog := map[string]Product{
		"pen": {Name: "stylo", Price: 1.5, Tags: []string{"bureau", "écriture"}},
	}

	pen := catalog["pen"]
	pair := line(pen)
	// TypeScript connaît le type de chaque position : une assertion l'ouvre.
	name := pair[0].(string)
	price := pair[1].(float64)

	fmt.Println(name + " coûte " + strconv.FormatFloat(price, 'f', -1, 64) +
		" (" + strconv.Itoa(len(pen.Tags)) + " étiquettes)")
}
