# Historique · Traduire les types

## Au départ : une traduction par transformeur

Chaque transformeur traduisait lui-même les types qu'il rencontrait, à partir de ce qui était **écrit** dans le code (les nœuds de type). Résultat :
- `number[]` n'était pas géré à un endroit ;
- les unions étaient refusées à un autre ;
- les marques DuploJS (`number & Positive`) n'étaient jamais retirées.

La même erreur se corrigeait plusieurs fois.

## Décision D-18 : une couche centrale (18/11)

- **Un seul point de vérité**, `tsTypeToGo(type)`.
- **Il lit le type résolu par le checker**, pas le texte. Les types calculés (`Extract`, `ReturnType`, génériques instanciés) n'ont donc besoin d'aucune règle : le checker donne leur résultat à chaque endroit.
- **Livré par phases**, pour ne jamais casser les projets qui passaient :
  1. les types primitifs et les unions d'`Either`, le reste en erreur claire `type-not-supported-yet` ;
  2. la lecture typée aux endroits où le type change (narrowing) ;
  3. tableaux, tuples, objets, fonctions, `Promise` ;
  4. le comportement des valeurs (longueur des chaînes en UTF-16…).

## Les choix discutés

- **`number` → `float64` (D-08)**, et pas `int`. JavaScript n'a qu'un type de nombre, un flottant 64 bits : `7 / 2` vaut `3.5`, et `0.1 + 0.2` vaut `0.30000000000000004`. Un `int` changerait les résultats.
- **Objets → structs anonymes.** Go considère deux structs anonymes de même forme comme **le même type**, ce qui ressemble au typage structurel de TypeScript. Le nom TS de chaque champ est gardé dans un tag (`json:"name"`), pour l'affichage et pour retrouver un champ par son nom. Quand les formes diffèrent, voir [04](../04-typage-structurel/).
- **Tuples.** La première idée était `[3]T` ou un struct `{ V0; V1 }`. On les a finalement traduits en slices (`[]T`, ou `[]any` si les positions ont des types différents), pour qu'un tuple marche directement avec les helpers de tableaux (`DArray.map`…).
- **Unions de valeurs** (`string | number`) : `any` quand les membres donnent des types Go différents, sinon le type commun (`"a" | "b"` → `string`). Le traitement fin des unions est décrit en [05](../05-unions-de-types-connus/).
- **Génériques non résolus** : on prend leur contrainte (`T extends string` → `string`), sinon `any`.
