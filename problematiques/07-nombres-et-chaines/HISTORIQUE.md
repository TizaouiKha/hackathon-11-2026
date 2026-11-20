# Historique · Les nombres et les chaînes

## `number` : `float64` ou `int` ? (D-08)

`int` aurait été plus rapide pour les compteurs, mais JavaScript n'a **qu'un** type de nombre, un flottant 64 bits. `7 / 2` vaut `3.5` et `0.1 + 0.2` vaut `0.30000000000000004`. Choisir `int` pour certaines variables aurait demandé de **prouver** qu'elles restent entières, avec un risque d'erreur silencieuse. ✅ `float64` partout.

## Afficher un nombre (D-12)

| Piste | Verdict |
|---|---|
| `fmt.Sprint` / `%v` | ❌ écrit `1e+21` comme Go, `3.000000` avec `%f` |
| `strconv.FormatFloat(f, 'f', -1, 64)` | ❌ juste pour les cas courants, mais faux pour `1e21` (`1000000000000000000000`), `1e-7`, `-0`, `NaN` et `Infinity` |
| **Suivre l'algorithme de la spécification ECMAScript** | ✅ **Retenue**. On part des chiffres les plus courts que donne `FormatFloat(…, 'e', -1, 64)` (la même règle que JS), puis on place la virgule ou l'exposant selon les seuils de JS. |

**Vérifié** : `tests/js-number-to-string`, **2 034 nombres** (34 cas limites et 2 000 `float64` aléatoires tirés sur tous les bits, avec une graine fixe) comparés à `String(x)` de Node : **aucun écart**.

## Les opérateurs (relecture R-01 de l'étape 5)

Une relecture « adversariale » (29 pièges transpilés et comparés à JS) a trouvé quatre écarts, tous corrigés :
- `%` → `math.Mod` ;
- opérateurs bit à bit en entiers 32 bits signés, comme JS ;
- `1e400` → `math.Inf(1)` ;
- `&&` / `||` entre nombres renvoient **la valeur** (`0 || 5` vaut `5`), pas un booléen.

Elle a aussi vérifié que Go calcule `0.1 + 0.2`, `1 / 3`, `1e16 + 1`… exactement comme JS : les deux suivent IEEE 754.

## `Math.round` (D-19)

JS arrondit `-2.5` à `-2` (vers +∞), Go à `-3` (en s'éloignant de zéro). Un helper reproduit la règle de JS.

## Les chaînes (D-18, phase 4)

JS mesure les chaînes en **unités UTF-16**, Go en **octets UTF-8**. Les helpers de chaîne (`length`, `slice`, `charAt`, `indexOf`, `at`…) convertissent avant de compter, pour que `"😀".length` vaille `2` comme en JS.
