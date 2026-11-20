package step11

import "testing"

type integerEither struct {
	tag   uint8
	value any
}

type stringEither struct {
	information string
	value       any
}

type typedEither struct {
	tag   uint8
	value float64
}

var rightTags = [256]bool{true}

var sinkBool bool
var sinkFloat float64
var sinkIntegerEither integerEither
var sinkTypedEither typedEither

func isIntegerRight(input integerEither) bool {
	return rightTags[input.tag]
}

func isStringRight(input stringEither) bool {
	return input.information == "success"
}

func whenIsRight(input integerEither, callback func(float64) float64) integerEither {
	if isIntegerRight(input) {
		return integerEither{tag: input.tag, value: callback(input.value.(float64))}
	}

	return input
}

func BenchmarkIntegerTag(b *testing.B) {
	input := integerEither{tag: 0, value: float64(42)}
	result := false

	b.ResetTimer()
	for range b.N {
		result = isIntegerRight(input)
	}
	sinkBool = result
}

func BenchmarkStringInformation(b *testing.B) {
	input := stringEither{information: "success", value: float64(42)}
	result := false

	b.ResetTimer()
	for range b.N {
		result = isStringRight(input)
	}
	sinkBool = result
}

func BenchmarkAnyAssertion(b *testing.B) {
	var input any = float64(42)
	total := float64(0)

	b.ResetTimer()
	for range b.N {
		total += input.(float64)
	}
	sinkFloat = total
}

func BenchmarkTypedValue(b *testing.B) {
	input := float64(42)
	total := float64(0)

	b.ResetTimer()
	for range b.N {
		total += input
	}
	sinkFloat = total
}

func BenchmarkBoxFloatInAny(b *testing.B) {
	for index := range b.N {
		sinkIntegerEither = integerEither{tag: 0, value: float64(index)}
	}
}

func BenchmarkStoreTypedFloat(b *testing.B) {
	for index := range b.N {
		sinkTypedEither = typedEither{tag: 0, value: float64(index)}
	}
}

func BenchmarkWhenIsRightHelper(b *testing.B) {
	input := integerEither{tag: 0, value: float64(42)}
	double := func(value float64) float64 { return value * 2 }
	result := input

	b.ResetTimer()
	for range b.N {
		result = whenIsRight(input, double)
	}
	sinkIntegerEither = result
}

func BenchmarkWhenIsRightInline(b *testing.B) {
	input := integerEither{tag: 0, value: float64(42)}
	double := func(value float64) float64 { return value * 2 }
	result := input

	b.ResetTimer()
	for range b.N {
		if rightTags[input.tag] {
			result = integerEither{tag: input.tag, value: double(input.value.(float64))}
		} else {
			result = input
		}
	}
	sinkIntegerEither = result
}
