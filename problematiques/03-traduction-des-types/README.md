# 03 · Traduire les types : `tsTypeToGo`

## Le problème

Les types TypeScript sont beaucoup plus riches que ceux de Go : unions, types littéraux (`"admin"`), marques (`number & Positive`), types calculés (`Extract`, `ReturnType`), génériques, tuples, `Record`, `Promise`… De plus, en TypeScript, le type d'une même variable **change selon l'endroit** (voir [06](../06-narrowing/)).

## La stratégie retenue

**Un seul endroit** traduit un type TypeScript en type Go : `src/transpiler/transformers/type/tsTypeToGo.ts`. Il travaille sur le type **résolu par le checker**, pas sur ce qui est écrit dans le code : `Extract<…>` ou `ReturnType<…>` arrivent déjà calculés.

| TypeScript | Go | Pourquoi |
|---|---|---|
| `number` (et littéraux, marques) | `float64` | un nombre JS est un flottant 64 bits |
| `string`, `boolean` | `string`, `bool` | |
| `null`, `undefined` | `JSNull`, `JSUndefined` | deux structs vides, affichées comme en JS |
| objet `{ name: string }` | `struct{ Sourced_name string "json:\"name\"" }` | struct **anonyme** ; le tag garde le nom TS pour l'affichage |
| `T[]`, tuple `[A, B]` | `[]T`, `[]any` | un tuple devient une slice, `[]any` si ses positions ont des types différents |
| `Record<string, T>` | `map[string]T` | |
| `(a: A) => R` | `func(A) R` | |
| union d'`Either` | `EitherAny` | voir [02](../02-either-et-issues/) |
| union de types différents | `any` | voir [05](../05-unions-de-types-connus/) |
| `"a" \| "b"` | `string` | un seul type Go suffit |
| `Promise<T>` | `T` | exécution synchrone, voir [11](../11-asynchrone/) |

## L'exemple

`exemples/` : un type objet avec une liste, un tuple mixte et un `Record`.

## Limites

Un type récursif, une classe, ou un objet à la fois appelable et doté de propriétés sont refusés avec un message clair.
