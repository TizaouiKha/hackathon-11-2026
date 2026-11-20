// Traduction écrite à la main de exemple.ts : l'objet temporaire.
package main

import "fmt"

type User = struct {
	ID    float64 `json:"id"`
	Name  string  `json:"name"`
	Email string  `json:"email"`
}

// La forme attendue par greet : un autre struct, avec seulement `name`.
type Named = struct {
	Name string `json:"name"`
}

func greet(person Named) string {
	return "Bonjour " + person.Name
}

func greetAll(people []Named) string {
	text := ""
	for _, person := range people {
		text = text + "[" + greet(person) + "]"
	}
	return text
}

func main() {
	ada := User{ID: 1, Name: "Ada", Email: "ada@example.com"}
	team := []User{ada, {ID: 2, Name: "Bob", Email: "bob@example.com"}}

	// L'objet temporaire : on copie seulement les champs que greet peut voir.
	fmt.Println(greet(Named{Name: ada.Name}))

	// Une liste d'objets : une nouvelle slice, élément par élément.
	named := make([]Named, len(team))
	for index, user := range team {
		named[index] = Named{Name: user.Name}
	}
	fmt.Println(greetAll(named))
}
