# 10 · `pipe`, formes curryfiées et fonctions passées en valeur

## Le problème

Le style DuploJS repose sur les fonctions :

```ts
DCommon.pipe(5, double, addTen);                 // enchaîner des fonctions
DCommon.pipe(list, DArray.map((x) => x * 10));   // forme curryfiée : sans la donnée
DArray.filter(list, DNumber.isEven);             // une fonction passée en valeur
DArray.map(list, () => 0);                       // un callback qui ignore ses paramètres
```

Go est strict sur ces trois points :
- **pas de génériques variadiques**, donc pas de `Pipe(x, f, g, h…)` générique ;
- **la signature exacte** d'une fonction doit correspondre ;
- **pas de fonctions « à moitié appliquées »**.

## La stratégie retenue

| Cas | Go produit |
|---|---|
| `pipe(x, f, g)` | **déroulé** à la compilation : `t1 := f(x)`, `t2 := g(t1)` (D-10) |
| forme curryfiée `DArray.map(f)` | une **fonction Go littérale** `func(input []float64) []float64 { return Map(input, f) }`, typée par la signature que le checker attend (D-17) |
| fonction Duplo en valeur (`DNumber.isEven`) | directement son helper Go : `NumberIsEven`, de type `func(float64) bool` |
| callback avec moins de paramètres que fournis | **enveloppé** : `func(element float64, _ Params) float64 { return f() }` |

Les arguments d'une forme curryfiée sont évalués **une seule fois**, à sa création, comme en JS.

## L'exemple

`exemples/` : les quatre cas ci-dessus.
