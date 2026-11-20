# Historique · L'affichage

## Le constat (17/11)

En lisant le code de DuploJS (`@duplojs/lang/dist/common/print.mjs`), on a vu que `print` appelle `console.info` : c'est donc `util.inspect` de Node qui formate, pas JSON. C'est devenu D-13.

## Pistes explorées

| Piste | Verdict |
|---|---|
| `fmt.Println` / `%v` | ❌ format Go (`{Ada 1.5}`, `[1 2 3]`), ni noms de champs ni guillemets |
| `json.Marshal` | ❌ guillemets doubles, pas d'espaces, `undefined` impossible |
| **Un `Inspect` en Go, par réflexion** | ✅ **Retenue (étape 4)**. Il parcourt la valeur et retrouve les noms des champs TS dans les tags des structs. |
| Générer un affichage spécialisé par type, à la compilation | ⏸️ Plus rapide, mais beaucoup plus de code généré. `print` n'est pas sur le chemin critique des calculs, donc la réflexion est acceptable ici. |

## Points tranchés en route

- **Les nombres** passent par `JSNumberToString` (D-12), car `util.inspect` les écrit comme `String(x)`.
- **`TagValue`** (voir [02](../02-either-et-issues/)) : quand un Either porte une valeur brute, `print` affiche seulement la valeur (`[ 3 ]`), comme DuploJS.
- **Un champ facultatif absent** valait `nil` en Go, ce qui s'affichait mal. On le remplit maintenant avec `JSUndefined{}`, comme JS (correctif trouvé avec D-24).
- **Les sorties de référence** de chaque projet sont dans `EXERCICES.md`, et chaque test d'exécution compare `Inspect(valeur)` au texte produit par Node.

## Limite connue

`util.inspect` regroupe un tableau de plus de 6 nombres sur plusieurs lignes (`groupArrayElements`). Ce n'est pas encore imité. Noté dans `ETAPES.md`, et contourné dans les tests.
