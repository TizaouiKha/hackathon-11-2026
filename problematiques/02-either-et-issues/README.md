# 02 · Les `Either` : représenter les issues de DuploJS en Go

## Le problème

DuploJS ne lance pas d'exceptions. Une fonction **renvoie** l'une de ses **issues** : un succès, ou une erreur précise (`"division-by-zero"`). Chaque issue porte une valeur, chacune de son propre type, et une fonction peut en avoir autant qu'elle veut. TypeScript décrit ça avec une union (`Success<number> | Left<"division-by-zero", number> | …`). **Go n'a pas d'union.**

## La stratégie retenue

```go
type EitherAny struct {
    Tag   EitherTag // QUELLE issue : un entier, une constante générée par information
    Value any       // la valeur de cette issue
}
```

- **L'issue est un entier** (1 octet). Le transpileur relève toutes les informations du programme et numérote chacune (`TagRightSuccess`, `TagLeftDivisionByZero`…). Deux tables générées retrouvent le **côté** (succès ou erreur) et le **texte** de l'information pour l'affichage.
- **La valeur est dans un `any`.** À chaque lecture, le checker connaît son type exact, et le transpileur génère une assertion `e.Value.(float64)` (environ 1,4 ns, sans allocation).
- **Un seul type pour toutes les unions d'Either**, quel que soit le nombre d'issues. Les helpers (`WhenIsRight`, `RightThen`, `MatchInformation`…) sont écrits une seule fois.

## L'exemple

`exemples/` : une division à trois issues (succès, division par zéro, opérande négatif), puis un affichage selon l'issue.

## Limites

Ranger un `float64` dans un `any` coûte une allocation (voir [13](../13-performance-et-benchmarks/)). Une case dédiée `Num float64` est une optimisation possible, pas encore faite.
