// Test d'exécution des opérateurs JavaScript (revue adversariale de l'étape 5, DECISIONS.md R-01).
// Valeurs attendues calculées par Node sur le même code ; comparaison bit pour bit
// (distingue 0 et -0, et tous les NaN sont égaux entre eux).
// Généré une fois puis figé. Lancé par ./.commands/test-runtime.sh.
package main

import (
	"fmt"
	"math"
	"os"

	operators "duplojs.local/transpiled/operators.ts"
)

var failures = 0

func report(ok bool, name string, got any) {
	status := "OK  "
	if !ok {
		status = "FAIL"
		failures++
	}
	fmt.Printf("%s %-46s got=%v\n", status, name, got)
}

func expectNumber(name string, got float64, wantBits uint64) {
	want := math.Float64frombits(wantBits)
	ok := math.Float64bits(got) == wantBits || (math.IsNaN(got) && math.IsNaN(want))
	report(ok, name, got)
}

func expectBool(name string, got bool, want bool) {
	report(got == want, fmt.Sprintf("%s = %v", name, want), got)
}

func main() {
	expectNumber("infinityLiteral() = Infinity", operators.Sourced_infinityLiteral(), 9218868437227405312)
	expectNumber("modulo(7, 2) = 1", operators.Sourced_modulo(math.Float64frombits(4619567317775286272), math.Float64frombits(4611686018427387904)), 4607182418800017408)
	expectNumber("modulo(-7, 2) = -1", operators.Sourced_modulo(math.Float64frombits(13842939354630062080), math.Float64frombits(4611686018427387904)), 13830554455654793216)
	expectNumber("modulo(7, -2) = 1", operators.Sourced_modulo(math.Float64frombits(4619567317775286272), math.Float64frombits(13835058055282163712)), 4607182418800017408)
	expectNumber("modulo(5.5, 2) = 1.5", operators.Sourced_modulo(math.Float64frombits(4617878467915022336), math.Float64frombits(4611686018427387904)), 4609434218613702656)
	expectNumber("modulo(7, 0) = NaN", operators.Sourced_modulo(math.Float64frombits(4619567317775286272), math.Float64frombits(0)), 9221120237041090560)
	expectNumber("modulo(-0, 5) = -0", operators.Sourced_modulo(math.Float64frombits(9223372036854775808), math.Float64frombits(4617315517961601024)), 9223372036854775808)
	expectNumber("modulo(Infinity, 2) = NaN", operators.Sourced_modulo(math.Float64frombits(9218868437227405312), math.Float64frombits(4611686018427387904)), 18444492273895866368)
	expectNumber("modulo(7, Infinity) = 7", operators.Sourced_modulo(math.Float64frombits(4619567317775286272), math.Float64frombits(9218868437227405312)), 4619567317775286272)
	expectNumber("modulo(0.3, 0.1) = 0.09999999999999998", operators.Sourced_modulo(math.Float64frombits(4599075939470750515), math.Float64frombits(4591870180066957722)), 4591870180066957720)
	expectNumber("bitAnd(5, 3) = 1", operators.Sourced_bitAnd(math.Float64frombits(4617315517961601024), math.Float64frombits(4613937818241073152)), 4607182418800017408)
	expectNumber("bitAnd(-1, 255) = 255", operators.Sourced_bitAnd(math.Float64frombits(13830554455654793216), math.Float64frombits(4643176031446892544)), 4643176031446892544)
	expectNumber("bitAnd(4294967301, 1) = 1", operators.Sourced_bitAnd(math.Float64frombits(4751297606881116160), math.Float64frombits(4607182418800017408)), 4607182418800017408)
	expectNumber("bitAnd(1.9, 3) = 1", operators.Sourced_bitAnd(math.Float64frombits(4611235658464650854), math.Float64frombits(4613937818241073152)), 4607182418800017408)
	expectNumber("bitAnd(-1.9, 3) = 3", operators.Sourced_bitAnd(math.Float64frombits(13834607695319426662), math.Float64frombits(4613937818241073152)), 4613937818241073152)
	expectNumber("bitAnd(NaN, 7) = 0", operators.Sourced_bitAnd(math.Float64frombits(9221120237041090560), math.Float64frombits(4619567317775286272)), 0)
	expectNumber("bitAnd(Infinity, 7) = 0", operators.Sourced_bitAnd(math.Float64frombits(9218868437227405312), math.Float64frombits(4619567317775286272)), 0)
	expectNumber("bitOr(5, 3) = 7", operators.Sourced_bitOr(math.Float64frombits(4617315517961601024), math.Float64frombits(4613937818241073152)), 4619567317775286272)
	expectNumber("bitOr(1.9, 0) = 1", operators.Sourced_bitOr(math.Float64frombits(4611235658464650854), math.Float64frombits(0)), 4607182418800017408)
	expectNumber("bitOr(-1.9, 0) = -1", operators.Sourced_bitOr(math.Float64frombits(13834607695319426662), math.Float64frombits(0)), 13830554455654793216)
	expectNumber("bitOr(4294967296, 0) = 0", operators.Sourced_bitOr(math.Float64frombits(4751297606875873280), math.Float64frombits(0)), 0)
	expectNumber("bitOr(2147483648, 0) = -2147483648", operators.Sourced_bitOr(math.Float64frombits(4746794007248502784), math.Float64frombits(0)), 13970166044103278592)
	expectNumber("bitOr(NaN, 0) = 0", operators.Sourced_bitOr(math.Float64frombits(9221120237041090560), math.Float64frombits(0)), 0)
	expectNumber("bitOr(1e+21, 0) = -559939584", operators.Sourced_bitOr(math.Float64frombits(4921056587992461136), math.Float64frombits(0)), 13961352358895026176)
	expectNumber("bitXor(5, 3) = 6", operators.Sourced_bitXor(math.Float64frombits(4617315517961601024), math.Float64frombits(4613937818241073152)), 4618441417868443648)
	expectNumber("bitXor(-1, 0) = -1", operators.Sourced_bitXor(math.Float64frombits(13830554455654793216), math.Float64frombits(0)), 13830554455654793216)
	expectNumber("bitXor(2147483648, 1) = -2147483647", operators.Sourced_bitXor(math.Float64frombits(4746794007248502784), math.Float64frombits(4607182418800017408)), 13970166044099084288)
	expectNumber("leftShift(1, 31) = -2147483648", operators.Sourced_leftShift(math.Float64frombits(4607182418800017408), math.Float64frombits(4629418941960159232)), 13970166044103278592)
	expectNumber("leftShift(1, 32) = 1", operators.Sourced_leftShift(math.Float64frombits(4607182418800017408), math.Float64frombits(4629700416936869888)), 4607182418800017408)
	expectNumber("leftShift(1, 33) = 2", operators.Sourced_leftShift(math.Float64frombits(4607182418800017408), math.Float64frombits(4629841154425225216)), 4611686018427387904)
	expectNumber("leftShift(3, 1) = 6", operators.Sourced_leftShift(math.Float64frombits(4613937818241073152), math.Float64frombits(4607182418800017408)), 4618441417868443648)
	expectNumber("leftShift(-1, 31) = -2147483648", operators.Sourced_leftShift(math.Float64frombits(13830554455654793216), math.Float64frombits(4629418941960159232)), 13970166044103278592)
	expectNumber("leftShift(1, -1) = -2147483648", operators.Sourced_leftShift(math.Float64frombits(4607182418800017408), math.Float64frombits(13830554455654793216)), 13970166044103278592)
	expectNumber("signedRightShift(-8, 1) = -4", operators.Sourced_signedRightShift(math.Float64frombits(13844065254536904704), math.Float64frombits(4607182418800017408)), 13839561654909534208)
	expectNumber("signedRightShift(-1, 31) = -1", operators.Sourced_signedRightShift(math.Float64frombits(13830554455654793216), math.Float64frombits(4629418941960159232)), 13830554455654793216)
	expectNumber("signedRightShift(2147483648, 0) = -2147483648", operators.Sourced_signedRightShift(math.Float64frombits(4746794007248502784), math.Float64frombits(0)), 13970166044103278592)
	expectNumber("signedRightShift(16, 33) = 8", operators.Sourced_signedRightShift(math.Float64frombits(4625196817309499392), math.Float64frombits(4629841154425225216)), 4620693217682128896)
	expectNumber("unsignedRightShift(-1, 0) = 4294967295", operators.Sourced_unsignedRightShift(math.Float64frombits(13830554455654793216), math.Float64frombits(0)), 4751297606873776128)
	expectNumber("unsignedRightShift(-8, 1) = 2147483644", operators.Sourced_unsignedRightShift(math.Float64frombits(13844065254536904704), math.Float64frombits(4607182418800017408)), 4746794007231725568)
	expectNumber("unsignedRightShift(-1, 31) = 1", operators.Sourced_unsignedRightShift(math.Float64frombits(13830554455654793216), math.Float64frombits(4629418941960159232)), 4607182418800017408)
	expectNumber("unsignedRightShift(16, 32) = 16", operators.Sourced_unsignedRightShift(math.Float64frombits(4625196817309499392), math.Float64frombits(4629700416936869888)), 4625196817309499392)
	expectNumber("unsignedRightShift(1.5, 0) = 1", operators.Sourced_unsignedRightShift(math.Float64frombits(4609434218613702656), math.Float64frombits(0)), 4607182418800017408)
	expectNumber("numberOr(0, 5) = 5", operators.Sourced_numberOr(math.Float64frombits(0), math.Float64frombits(4617315517961601024)), 4617315517961601024)
	expectNumber("numberOr(3, 5) = 3", operators.Sourced_numberOr(math.Float64frombits(4613937818241073152), math.Float64frombits(4617315517961601024)), 4613937818241073152)
	expectNumber("numberOr(NaN, 5) = 5", operators.Sourced_numberOr(math.Float64frombits(9221120237041090560), math.Float64frombits(4617315517961601024)), 4617315517961601024)
	expectNumber("numberOr(-0, 5) = 5", operators.Sourced_numberOr(math.Float64frombits(9223372036854775808), math.Float64frombits(4617315517961601024)), 4617315517961601024)
	expectNumber("numberOr(-2, 5) = -2", operators.Sourced_numberOr(math.Float64frombits(13835058055282163712), math.Float64frombits(4617315517961601024)), 13835058055282163712)
	expectNumber("numberAnd(0, 5) = 0", operators.Sourced_numberAnd(math.Float64frombits(0), math.Float64frombits(4617315517961601024)), 0)
	expectNumber("numberAnd(3, 5) = 5", operators.Sourced_numberAnd(math.Float64frombits(4613937818241073152), math.Float64frombits(4617315517961601024)), 4617315517961601024)
	expectNumber("numberAnd(NaN, 5) = NaN", operators.Sourced_numberAnd(math.Float64frombits(9221120237041090560), math.Float64frombits(4617315517961601024)), 9221120237041090560)
	expectNumber("numberAnd(-0, 5) = -0", operators.Sourced_numberAnd(math.Float64frombits(9223372036854775808), math.Float64frombits(4617315517961601024)), 9223372036854775808)
	expectNumber("numberOrCall(0) = 1", operators.Sourced_numberOrCall(math.Float64frombits(0)), 4607182418800017408)
	expectNumber("numberOrCall(4) = 4", operators.Sourced_numberOrCall(math.Float64frombits(4616189618054758400)), 4616189618054758400)
	expectBool("booleanOr(false, false)", operators.Sourced_booleanOr(false, false), false)
	expectBool("booleanOr(false, true)", operators.Sourced_booleanOr(false, true), true)
	expectBool("booleanOr(true, false)", operators.Sourced_booleanOr(true, false), true)

	if failures > 0 {
		fmt.Printf("\n%d échec(s)\n", failures)
		os.Exit(1)
	}
	fmt.Printf("\nTous les contrôles passent (%d).\n", 56)
}
