# 07 · Les nombres et les chaînes : imiter les règles de JavaScript

## Le problème

Un même calcul ne donne pas le même résultat en JavaScript et en Go, si l'on traduit naïvement :

| Expression | JavaScript | Go naïf |
|---|---|---|
| `0.1 + 0.2` | `0.30000000000000004` | `0.3` : Go calcule les **constantes** en précision exacte ; le transpileur écrit donc `float64(0.1) + float64(0.2)` |
| `String(3)` | `3` | `3.000000` (`%f`) |
| `String(1e21)` | `1e+21` | `1000000000000000000000` |
| `String(-0)` | `0` | `-0` |
| `1 / 0` | `Infinity` | refusé à la compilation (constante), ou `+Inf` |
| `-7 % 3` | `-1` | `%` refusé sur des `float64` |
| `Math.round(-2.5)` | `-2` | `math.Round(-2.5)` = `-3` |
| `(2 ** 31) \| 0` | `-2147483648` (entier 32 bits) | dépend de la conversion |
| `"é".length` | `1` (UTF-16) | `len("é")` = `2` (UTF-8) |
| `"😀".length` | `2` (UTF-16) | `len("😀")` = `4` |

## La stratégie retenue

- **`number` → `float64`** partout (D-08).
- **`JSNumberToString` (D-12)** suit pas à pas l'algorithme de la spécification ECMAScript (« Number::toString »). Vérifié sur **2 034 nombres** comparés à Node, sans écart.
- **Opérateurs** : `%` → `math.Mod` (même signe que JS) ; opérateurs bit à bit en `int32`, comme JS ; une division par la constante `0` passe par une variable.
- **`Math.round` et `Math.sign`** ont leur propre helper, avec l'arrondi de JS.
- **Chaînes** : `JSStringLength`, `JSStringSlice`, `charAt`, `indexOf`… comptent en **unités UTF-16**, comme JS.

## L'exemple

`exemples/` : chacun des pièges du tableau, avec un petit `jsNumber` écrit à la main. La version complète, qui gère aussi `1e-7`, est dans le transpileur.
