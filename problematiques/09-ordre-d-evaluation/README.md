# 09 · Garder l'ordre d'évaluation de JavaScript

## Le problème

JavaScript évalue les opérandes **de gauche à droite** :

```ts
let shared = 1;
function change() { shared = 2; return shared; }

consume(shared, change());   // JS : consume(1, 2), shared est lu AVANT change()
```

En Go, deux choses peuvent casser cet ordre :
1. **La spécification Go garantit l'ordre des appels de fonction**, mais pas le moment où une simple variable est lue par rapport à un appel voisin.
2. **Le transpileur sort parfois un calcul avant l'expression** (une instruction préparatoire, voir [01](../01-strategie-de-traduction/)) : `tmp := change()`, puis `consume(shared, tmp)`. `shared` est alors lu **après** `change()`, et `consume` reçoit `2, 2`.

## La stratégie retenue (R-01 n° 2)

Quand un opérande a des instructions sorties avant l'expression, **chaque opérande précédent qui pourrait changer entre-temps est d'abord copié** :

```go
tmp0 := shared       // lu en premier, comme JS
tmp1 := change()
consume(tmp0, tmp1)  // consume(1, 2)
```

- **Pas de copie inutile** : les littéraux, les constantes, les fonctions, les imports et les variables **jamais réaffectées** sont lus directement.
- C'est appliqué aux appels, aux opérateurs, aux tableaux littéraux et aux objets littéraux.

## L'exemple

`exemples/` : le cas `consume(shared, change())`, et le même piège dans un objet littéral.
