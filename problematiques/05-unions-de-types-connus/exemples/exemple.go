// Traduction écrite à la main de exemple.ts : chaque valeur est rangée sous le type
// exact de son membre, puis ressortie par une assertion ou un switch sur le type.
package main

import (
	"fmt"
	"strconv"
)

type User = struct {
	Name string  `json:"name"`
	Age  float64 `json:"age"`
}

type Circle = struct {
	Kind   string  `json:"kind"`
	Radius float64 `json:"radius"`
}

type Square = struct {
	Kind string  `json:"kind"`
	Side float64 `json:"side"`
}

func number(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

// Value = string | "admin" | User : une boîte any, dont on connaît tous les contenus possibles.
func describe(value any) string {
	if value == "admin" {
		return "ADMIN"
	}
	switch typed := value.(type) {
	case string:
		return "texte:" + typed
	case User:
		return "user:" + typed.Name + "/" + number(typed.Age)
	}
	panic("inatteignable : TypeScript garantit que tous les cas sont traités")
}

// shape.kind : chaque membre lit son propre champ.
func kind(shape any) string {
	switch typed := shape.(type) {
	case Circle:
		return typed.Kind
	case Square:
		return typed.Kind
	}
	panic("inatteignable")
}

func area(shape any) float64 {
	switch kind(shape) {
	case "circle":
		circle := shape.(Circle) // TypeScript a rétréci le type : une assertion suffit
		return circle.Radius * circle.Radius * 3
	case "square":
		square := shape.(Square)
		return square.Side * square.Side
	}
	// Le switch couvre tous les cas : Go exige quand même une fin.
	panic("inatteignable : TypeScript garantit que tous les cas sont traités")
}

// "radius" in shape : décidé à la compilation pour chaque membre.
func hasRadius(shape any) bool {
	switch shape.(type) {
	case Circle:
		return true
	}
	return false
}

func main() {
	// Entrer dans l'union : chaque valeur est rangée sous le type exact de son membre.
	values := []any{"admin", "bonjour", User{Name: "Ada", Age: 36}}
	for _, value := range values {
		fmt.Println(describe(value))
	}

	shapes := []any{Circle{Kind: "circle", Radius: 2}, Square{Kind: "square", Side: 3}}
	for _, shape := range shapes {
		radius := "non"
		if hasRadius(shape) {
			radius = "oui"
		}
		fmt.Println(kind(shape) + " : aire " + number(area(shape)) + ", rayon " + radius)
	}
}
