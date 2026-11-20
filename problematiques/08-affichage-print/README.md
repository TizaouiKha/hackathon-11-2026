# 08 · L'affichage : `print` doit écrire comme Node

## Le problème

La validation compare **caractère par caractère** la sortie du Go et celle du TypeScript. Or `DCommon.print(x)` appelle `console.info(x)`, et Node formate la valeur avec `util.inspect` :

| Valeur | Node (`util.inspect`) | Go `fmt.Println` | Go `json.Marshal` |
|---|---|---|---|
| un objet | `{ name: 'Ada', score: 1.5 }` | `{Ada 1.5}` | `{"name":"Ada","score":1.5}` |
| un tableau | `[ 1, 2, 3 ]` | `[1 2 3]` | `[1,2,3]` |
| une chaîne seule | `Ada` | `Ada` | `"Ada"` |
| une chaîne dans un objet | `'Ada'` (guillemets simples) | `Ada` | `"Ada"` |
| `undefined` | `undefined` | `{}` | `{}` |

## La stratégie retenue (D-13)

Un **`Inspect` écrit en Go**, qui parcourt la valeur par réflexion et l'écrit au format de `util.inspect` :
- les noms des champs viennent des **tags** des structs (`json:"name"`), mis par `tsTypeToGo` ;
- les nombres passent par `JSNumberToString` (voir [07](../07-nombres-et-chaines/)) ;
- une chaîne seule est écrite sans guillemets, une chaîne dans un objet ou un tableau avec des guillemets simples ;
- `JSUndefined` et `JSNull` s'écrivent `undefined` et `null` ;
- un Either s'affiche comme l'objet DuploJS.

## L'exemple

`exemples/` : un mini `inspect` écrit à la main (objets, tableaux, chaînes, nombres, booléens), avec la même méthode.

## Limites

- Au-delà de **6 nombres**, Node répartit un tableau sur plusieurs lignes. Notre `Inspect` le laisse sur une seule.
- L'ordre des champs suit le **type TS**, pas l'ordre d'écriture de l'objet : un struct a une forme fixe.
