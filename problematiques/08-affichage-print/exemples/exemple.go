// Traduction écrite à la main de exemple.ts : un mini Inspect, même méthode que celui
// du transpileur (réflexion + noms des champs TS lus dans les tags).
package main

import (
	"fmt"
	"reflect"
	"strconv"
	"strings"
)

type Player = struct {
	Name   string   `json:"name"`
	Score  float64  `json:"score"`
	Tags   []string `json:"tags"`
	Active bool     `json:"active"`
}

// inspect écrit une valeur au format de util.inspect.
// nested : une chaîne dans un objet ou un tableau prend des guillemets simples.
func inspect(value reflect.Value, nested bool) string {
	switch value.Kind() {
	case reflect.String:
		if nested {
			return "'" + value.String() + "'"
		}
		return value.String()
	case reflect.Float64:
		return strconv.FormatFloat(value.Float(), 'f', -1, 64)
	case reflect.Bool:
		return strconv.FormatBool(value.Bool())
	case reflect.Slice:
		items := make([]string, value.Len())
		for index := range items {
			items[index] = inspect(value.Index(index), true)
		}
		return "[ " + strings.Join(items, ", ") + " ]"
	case reflect.Struct:
		fields := make([]string, value.NumField())
		for index := range fields {
			name := value.Type().Field(index).Tag.Get("json") // le nom TypeScript
			fields[index] = name + ": " + inspect(value.Field(index), true)
		}
		return "{ " + strings.Join(fields, ", ") + " }"
	}
	return fmt.Sprint(value.Interface())
}

func print(value any) {
	fmt.Println(inspect(reflect.ValueOf(value), false))
}

func main() {
	print(Player{Name: "Ada", Score: 1.5, Tags: []string{"admin", "dev"}, Active: true})
	print([]float64{1, 2, 3})
	print("Ada")
}
