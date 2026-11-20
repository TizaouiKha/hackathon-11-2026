# 12 · Couvrir la bibliothèque DuploJS

## Le problème

Un vrai code Duplo n'écrit presque pas de boucles ni de `let` : il appelle la bibliothèque `@duplojs/lang` (`DArray.filter`, `DObject.pick`, `DArray.reduce`, `DNumber.isEven`, `DCommon.when`…). Au départ, le transpileur n'en traduisait que ce que les exercices utilisaient (2 fonctions `DArray` sur 41, aucune de `DObject` ni de `DNumber`).

## La stratégie retenue : deux façons de traduire, selon la fonction

| Famille | Exemple | Traduction | Pourquoi |
|---|---|---|---|
| **Comportement à l'exécution** | `DArray.filter`, `find`, `some`, `DNumber.*`, `DCommon.when` | **un helper Go par fonction**, écrit une fois (`Filter[T]`, `NumberIsEven`…) | le résultat dépend des valeurs |
| **Forme connue à la compilation** | `DObject.pick`, `omit`, `assign`, `keys`, `countKeys` | **le résultat est construit directement**, champ par champ | TypeScript connaît la forme de l'objet : pas besoin de calcul à l'exécution |
| **Callback à outils** | `DArray.reduce(list, 0, ({ element, lastValue, next }) => …)` | l'objet d'outils devient un **struct Go** dont `next` et `exit` sont des fonctions | le corps du callback se traduit alors comme du code ordinaire |

Chaque fonction marche avec données, curryfiée dans un `pipe`, et passée en valeur (voir [10](../10-fonctions-et-curryfication/)).

**Couvert aujourd'hui** : `DEither` (les helpers des exercices), `DArray` (13 fonctions dont `reduce`), `DObject` (11), `DNumber` (les 22), `DCommon` (16), `DString` (12).

## L'exemple

`exemples/` : `filter` puis `map` dans un `pipe`, `reduce` avec `next`, et `pick`.
