// Traduction écrite à la main de exemple.ts : les copies qui gardent l'ordre de JavaScript.
package main

import (
	"fmt"
	"strconv"
)

var shared = 1.0
var trace = ""

func change() float64 {
	shared = 2
	return shared
}

func consume(first float64, second float64) string {
	return "consume(" + strconv.FormatFloat(first, 'f', -1, 64) + ", " +
		strconv.FormatFloat(second, 'f', -1, 64) + ")"
}

func log(name string) string {
	trace = trace + name
	return name
}

func same(value string) string {
	return value
}

func main() {
	// shared peut changer (change() le réaffecte) : il est copié AVANT l'appel.
	tmp0 := shared
	tmp1 := change()
	fmt.Println(consume(tmp0, tmp1))

	// Objet littéral : les valeurs sont préparées dans l'ordre de JavaScript.
	tmp2 := log("a")
	tmp3 := same(log("b"))
	pair := struct {
		First  string `json:"first"`
		Second string `json:"second"`
	}{First: tmp2, Second: tmp3}

	fmt.Println("ordre des appels : " + trace + " (" + pair.First + pair.Second + ")")
}
