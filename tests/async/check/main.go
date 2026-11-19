package main

import (
	"fmt"
	"os"
	"reflect"

	operations "duplojs.local/transpiled/operations.ts"
	shard "duplojs.local/transpiled/shard_dependencies"
)

var failures int

type objectOutput struct {
	First   float64
	Failed  float64
	Skipped float64
}

func expect(name string, got, want any) {
	if !reflect.DeepEqual(got, want) {
		fmt.Printf("FAIL %-32s got=%#v want=%#v\n", name, got, want)
		failures++
		return
	}
	fmt.Printf("OK   %s\n", name)
}

func field(value any, name string) any {
	return reflect.ValueOf(value).FieldByName(name).Interface()
}

func main() {
	right := operations.Sourced_asyncRight(3)
	expect("rightAsyncPipe succès", right.Value.(float64), float64(6))

	left := operations.Sourced_asyncFailure(0)
	expect("rightAsyncPipe arrête sur Left", left.Tag.Information(), "division-by-zero")

	rawRight := operations.Sourced_rawAsyncRight(3)
	expect("rightAsyncPipe accepte une valeur", rawRight.Value.(float64), float64(4))

	grouped := operations.Sourced_asyncGroup(3)
	expect("asyncGroup succès", grouped.Value.([]float64), []float64{6, 8})

	directGroup := operations.Sourced_directAsyncGroup(3)
	expect("asyncGroup valeurs directes", directGroup.Value.([]float64), []float64{3, 4})

	storedGetterGroup := operations.Sourced_storedGetterAsyncGroup(3)
	expect("asyncGroup tableau de getters", storedGetterGroup.Value.([]float64), []float64{6, 8})

	storedValueGroup := operations.Sourced_storedValueAsyncGroup(3)
	expect("asyncGroup tableau de valeurs", storedValueGroup.Value.([]float64), []float64{3, 4})

	storedMixedGroup := operations.Sourced_storedMixedAsyncGroup(3)
	expect("asyncGroup tableau mélangé", storedMixedGroup.Value.([]float64), []float64{6, 4})

	objectGroup := operations.Sourced_objectAsyncGroup(3)
	expect("asyncGroup objet valeur", field(objectGroup.Value, "Sourced_original"), float64(3))
	expect("asyncGroup objet getter", field(objectGroup.Value, "Sourced_doubled"), float64(6))
	expect("asyncGroup objet hétérogène", field(objectGroup.Value, "Sourced_label"), "ready")

	objectFailure := operations.Sourced_objectAsyncGroupFailure(0)
	expect("asyncGroup objet propage Left", objectFailure.Tag.Information(), "division-by-zero")

	objectThirdCalled := false
	objectShortCircuited := shard.AsyncGroupObject[objectOutput](
		[]func() shard.EitherAny{
			func() shard.EitherAny { return operations.Sourced_asyncRight(1) },
			func() shard.EitherAny { return operations.Sourced_asyncFailure(0) },
			func() shard.EitherAny {
				objectThirdCalled = true
				return operations.Sourced_asyncRight(2)
			},
		},
		[]func(*objectOutput, any){
			func(output *objectOutput, value any) { output.First = value.(float64) },
			func(output *objectOutput, value any) { output.Failed = value.(float64) },
			func(output *objectOutput, value any) { output.Skipped = value.(float64) },
		},
		right.Tag,
	)
	expect("asyncGroup objet garde le Left", objectShortCircuited.Tag.Information(), "division-by-zero")
	expect("asyncGroup objet court-circuite", objectThirdCalled, false)

	thirdCalled := false
	shortCircuited := shard.AsyncGroup[func() shard.EitherAny, float64](
		[]func() shard.EitherAny{
			func() shard.EitherAny { return operations.Sourced_asyncRight(1) },
			func() shard.EitherAny { return operations.Sourced_asyncFailure(0) },
			func() shard.EitherAny {
				thirdCalled = true
				return operations.Sourced_asyncRight(2)
			},
		},
		func(entry func() shard.EitherAny) shard.EitherAny { return entry() },
		right.Tag,
	)
	expect("asyncGroup garde le premier Left", shortCircuited.Tag.Information(), "division-by-zero")
	expect("asyncGroup court-circuite", thirdCalled, false)

	expect("asyncPipe succès", operations.Sourced_asyncPipeline(3), []string{"6", "8"})
	expect("asyncGroup propage Left", operations.Sourced_projectPipeline(), []string{"transaction annulée"})
	expect("await disparaît", operations.Sourced_awaitedValue(7), float64(7))
	expect("await conserve l'adaptation", operations.Sourced_awaitedAny(), "adapted")

	if failures > 0 {
		os.Exit(1)
	}
}
