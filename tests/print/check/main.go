package main

import (
	"fmt"
	"io"
	"math"
	"os"
	"strings"

	shard "duplojs.local/transpiled/shard_dependencies"
)

type sampleObject struct {
	Simple float64 `json:"simple"`
	Quoted float64 `json:"not-simple"`
}

func main() {
	rawValue := shard.Either[float64]{
		Tag:   shard.TagValue,
		Value: 6,
	}
	rawSlice := shard.Either2[[]float64, float64]{
		Tag:   shard.TagValue,
		Right: []float64{3},
	}

	outputReader, outputWriter, err := os.Pipe()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	originalStdout := os.Stdout
	os.Stdout = outputWriter
	returned := shard.Print("un opérande est négatif")
	shard.Print([]string{"3", "3", "échec"})
	shard.Print(rawValue)
	shard.Print(rawSlice)
	if err := outputWriter.Close(); err != nil {
		os.Stdout = originalStdout
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	os.Stdout = originalStdout

	printOutput, err := io.ReadAll(outputReader)
	if closeErr := outputReader.Close(); closeErr != nil {
		fmt.Fprintln(os.Stderr, closeErr)
		os.Exit(1)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if string(printOutput) != "un opérande est négatif\n[ '3', '3', 'échec' ]\n6\n[ 3 ]\n" {
		fmt.Fprintf(os.Stderr, "Print output mismatch: %q\n", printOutput)
		os.Exit(1)
	}
	if returned != "un opérande est négatif" {
		fmt.Fprintf(os.Stderr, "Print return mismatch: %q\n", returned)
		os.Exit(1)
	}

	success := shard.Either[float64]{
		Tag:   shard.TagRightSuccess,
		Value: 3,
	}
	fail := shard.Either[float64]{
		Tag: shard.TagLeftFail,
	}
	checks := []struct {
		name string
		got  string
		want string
	}{
		{"number", shard.Inspect(3.0), "3"},
		{"large number", shard.Inspect(1e21), "1e+21"},
		{"small number", shard.Inspect(1e-7), "1e-7"},
		{"negative zero", shard.Inspect(math.Copysign(0, -1)), "-0"},
		{"NaN", shard.Inspect(math.NaN()), "NaN"},
		{"positive infinity", shard.Inspect(math.Inf(1)), "Infinity"},
		{"negative infinity", shard.Inspect(math.Inf(-1)), "-Infinity"},
		{"standalone string", shard.Inspect("un opérande est négatif"), "un opérande est négatif"},
		{"number slice", shard.Inspect([]float64{3}), "[ 3 ]"},
		{"exercise 08 slice", shard.Inspect([]string{"3", "3", "échec"}), "[ '3', '3', 'échec' ]"},
		{"nil slice", shard.Inspect([]float64(nil)), "[]"},
		{"apostrophe quote", shard.Inspect([]string{"l'été"}), "[ \"l'été\" ]"},
		{"backtick quote", shard.Inspect([]string{"l'été \"ici\""}), "[ `l'été \"ici\"` ]"},
		{
			"unicode break length",
			shard.Inspect([]string{strings.Repeat("é", 38)}),
			"[ '" + strings.Repeat("é", 38) + "' ]",
		},
		{
			"object keys",
			shard.Inspect(sampleObject{Simple: 1, Quoted: 2}),
			"{ simple: 1, 'not-simple': 2 }",
		},
		{"raw Either value", shard.Inspect(rawValue), "6"},
		{"raw Either2 slice", shard.Inspect(rawSlice), "[ 3 ]"},
		{
			"Either success",
			shard.Inspect(success),
			"{\n  '@duplojs/lang/kind/@DuplojsLangEither/right': null,\n  '@duplojs/lang/kind/@DuplojsLangEither/information': 'success',\n  '@duplojs/lang/kind/@DuplojsLangEither/value': 3,\n  '@duplojs/lang/kind/@DuplojsLangEither/success': null\n}",
		},
		{
			"Either fail",
			shard.Inspect(fail),
			"{\n  '@duplojs/lang/kind/@DuplojsLangEither/left': null,\n  '@duplojs/lang/kind/@DuplojsLangEither/information': 'fail',\n  '@duplojs/lang/kind/@DuplojsLangEither/value': undefined,\n  '@duplojs/lang/kind/@DuplojsLangEither/fail': null\n}",
		},
	}

	for _, check := range checks {
		if check.got != check.want {
			fmt.Fprintf(os.Stderr, "%s: got %q, want %q\n", check.name, check.got, check.want)
			os.Exit(1)
		}
	}
}
