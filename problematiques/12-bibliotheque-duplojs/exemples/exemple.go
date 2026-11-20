// Traduction écrite à la main de exemple.ts : helpers génériques, outils de reduce
// en struct, et pick construit à la compilation.
package main

import (
	"fmt"
	"strconv"
	"strings"
)

type User = struct {
	Name   string  `json:"name"`
	Age    float64 `json:"age"`
	Active bool    `json:"active"`
}

// --- Helpers écrits une fois (shared dependencies) ---

func Filter[T any](input []T, predicate func(T) bool) []T {
	output := make([]T, 0, len(input))
	for _, element := range input {
		if predicate(element) {
			output = append(output, element)
		}
	}
	return output
}

func Map[T any, U any](input []T, theFunction func(T) U) []U {
	output := make([]U, len(input))
	for index, element := range input {
		output[index] = theFunction(element)
	}
	return output
}

// reduce : l'objet d'outils devient un struct, `next` et `exit` sont des fonctions.
type ReduceStep struct {
	Exit  bool
	Value any
}

type ReduceParams[T any, O any] struct {
	Element   T
	LastValue O
	Next      func(O) ReduceStep
	Exit      func(any) ReduceStep
}

func Reduce[T any, O any](input []T, from O, theFunction func(ReduceParams[T, O]) ReduceStep) any {
	lastValue := from
	next := func(value O) ReduceStep { return ReduceStep{Value: value} }
	exit := func(value any) ReduceStep { return ReduceStep{Exit: true, Value: value} }
	for _, element := range input {
		step := theFunction(ReduceParams[T, O]{Element: element, LastValue: lastValue, Next: next, Exit: exit})
		if step.Exit {
			return step.Value
		}
		lastValue = step.Value.(O)
	}
	return lastValue
}

func main() {
	users := []User{
		{Name: "Ada", Age: 36, Active: true},
		{Name: "Bob", Age: 7, Active: false},
		{Name: "Cy", Age: 21, Active: true},
	}

	// pipe(users, filter(...), map(...)) : déroulé, une variable par étape.
	step1 := Filter(users, func(user User) bool { return user.Active })
	activeNames := Map(step1, func(user User) string { return user.Name })
	fmt.Println("actifs : " + strings.Join(activeNames, ","))

	// Le corps du callback se traduit comme du code ordinaire.
	totalAge := Reduce(users, 0.0, func(params ReduceParams[User, float64]) ReduceStep {
		return params.Next(params.LastValue + params.Element.Age)
	}).(float64)
	fmt.Println("âge total : " + strconv.FormatFloat(totalAge, 'f', -1, 64))

	// pick(users[0], ["name"]) : aucun calcul, le struct résultat est écrit directement.
	card := struct {
		Name string `json:"name"`
	}{Name: users[0].Name}
	fmt.Println("{ name: '" + card.Name + "' }")
}
