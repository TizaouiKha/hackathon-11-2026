# 06 · Le narrowing : un type qui change selon l'endroit

## Le problème

En TypeScript, une même variable **change de type selon l'endroit** :

```ts
function double(value: number | string) {
	if (typeof value === "number") {
		return value * 2;      // ici, value est un number
	}
	return value + value;      // ici, value est un string
}
```

En Go, une variable a **un seul** type, celui de sa déclaration. `value` est un `any` partout, et Go refuse `value * 2`.

## La stratégie retenue : l'adaptateur (D-18.2)

À chaque expression, `expression/adapt.ts` compare trois types que donne le checker :

| Type | Question | Exemple |
|---|---|---|
| **produit** | Qu'est-ce que le Go fabrique vraiment ? Le type de la **déclaration**. | `value` : `any` |
| **rétréci** | Quel est le type TS à cet endroit ? | `number` |
| **attendu** | Qu'est-ce que l'endroit demande ? Le paramètre appelé, le type de retour… | `number` |

S'ils diffèrent, l'adaptateur insère ce qu'il faut :

| Cas | Go inséré |
|---|---|
| `any` → type précis | `value.(float64)` |
| Either → valeur | `result.Value.(float64)` |
| valeur → Either | `EitherAny{Tag: TagValue, Value: x}` |
| objet → autre forme d'objet | l'objet temporaire (voir [04](../04-typage-structurel/)) |
| valeur → union | le type exact du membre (voir [05](../05-unions-de-types-connus/)) |

## L'exemple

`exemples/` : `typeof`, `isLeft` sur un Either, et `??`.

## Limites

L'assertion est toujours sûre, parce que TypeScript a déjà prouvé le type à cet endroit. Le seul coût est l'assertion elle-même (environ 1,4 ns, voir [13](../13-performance-et-benchmarks/)).
