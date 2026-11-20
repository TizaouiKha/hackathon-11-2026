# Historique · Les unions de types connus

## Le constat de départ (20/11)

Un test sur le scénario `string | "admin" | User` a montré que le cas de base marchait déjà, mais :
- chaque lecture d'un champ d'un membre objet passait par `JSAs`, c'est-à-dire par la réflexion (`shape.side * shape.side` en faisait deux) ;
- lire le discriminant (`shape.kind`) passait par `JSGetProperty`, réflexion aussi ;
- trois cas ne compilaient pas : un objet littéral écrit directement dans une liste d'union, l'opérateur `in`, et un `switch` qui couvre tous les cas.

## Pistes explorées

| Piste | Idée | Verdict |
|---|---|---|
| **Garder `any` + réflexion** | `JSAs` recopie le struct à chaque lecture | ❌ Correct, mais il paie la réflexion partout, alors que tous les types sont connus. |
| **Un struct « somme »** | `struct{ Kind; Text string; User *User }`, une case par membre | ❌ Lourd : il faut un struct par union, des conversions entre unions différentes, et il se combine mal avec `EitherAny`, qui range déjà ses valeurs dans un `any`. |
| **Interfaces Go scellées** | Chaque membre implémente une méthode marqueur | ❌ Impossible pour `string` ou `float64` sans les envelopper dans un type à nous, ce qui les rend incompatibles avec tout le reste du Go généré. |
| **`any` + forme canonique par membre** | Ranger chaque valeur sous le type exact de son membre, puis ressortir par assertion ou `switch` sur le type | ✅ **Retenue** |

## Pourquoi c'est possible

Le choix repose sur une observation Duplo : **le lint interdit `any`**. Tous les membres d'une union sont donc connus, et le transpileur connaît d'avance la liste exacte des types Go qui peuvent se trouver dans la boîte. Une assertion est alors toujours sûre.

## Livré en deux parties

1. **PR #28** : ranger sous le type exact, ressortir par assertion, objet littéral dans une union (TypeScript dit à quel membre il correspond, discriminant compris), lecture du discriminant par un `switch` sur le type.
2. **PR #29** : l'opérateur `in`, et la fin de fonction. Go exige qu'une fonction se termine par une instruction « terminale ». Après un `switch` exhaustif, on ajoute un `panic` que le programme n'atteint jamais, et seulement quand Go en a besoin, sinon `go vet` signale du code inatteignable.

## Détails tranchés

- **`string | "admin"`** donne deux fois le type Go `string`. On garde pour ce type **tous** les types TS qui y mènent, sinon une valeur `"bonjour"` ne retrouverait pas son membre.
- **`"x" in obj` avec un champ facultatif** est refusé : JS distingue « absent » et « présent mais `undefined` », Go non.
- **Deux objets de même forme** sont fusionnés : Go ne peut pas les distinguer à l'exécution.

**Vérifié** : `tests/unions` (12 contrôles comparés à Node). Le Go produit ne contient plus aucun `JSAs` ni `JSGetProperty` pour ces cas.
