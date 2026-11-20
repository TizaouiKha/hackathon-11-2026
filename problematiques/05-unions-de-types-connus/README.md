# 05 · Les unions de types connus

## Le problème

Un paramètre `string | "admin" | User` peut contenir un texte **ou** un objet. Go n'a pas d'union : la seule boîte qui accepte les deux est un `any`. Il faut ensuite **ressortir** la donnée, rapidement et sans erreur, avec `typeof`, `===`, `in` ou un `switch` sur un discriminant (`kind`).

## La stratégie retenue (D-27)

Côté Duplo, le lint interdit `any` : **chaque membre d'une union est connu à la compilation**. D'où la règle :

> Toute valeur qui entre dans une union est rangée sous le type Go **exact** de son membre.

| Étape | Ce que fait le transpileur |
|---|---|
| **Entrer** | un objet plus grand, ou dans un autre ordre, est converti vers le type de son membre ; un objet littéral est construit au type du membre auquel il correspond |
| **Ressortir** | une simple assertion : `value.(User)` |
| **Lire un champ commun** (`shape.kind`) | un `switch` sur les types Go possibles |
| **`"barks" in animal`** | décidé à la compilation pour chaque membre, puis un `switch` sur le type |
| **`switch` qui couvre tous les cas** | une sortie impossible est ajoutée, car Go exige un `return` |

Il n'y a aucune réflexion : uniquement des assertions et des `switch` sur le type.

## L'exemple

`exemples/` : `string | "admin" | User`, puis une union discriminée lue avec `switch` et avec `in`.

## Limite

Deux membres qui donnent **exactement le même type Go** (deux objets de même forme) ne peuvent pas être distingués à l'exécution : ils sont fusionnés.
