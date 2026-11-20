# 11 · L'asynchrone : `async`, `await`, `Promise`

## Le problème

Le projet 10 utilise `async` / `await`, `asyncPipe`, `rightAsyncPipe` et `asyncGroup`. Go n'a ni `Promise` ni `async` : il a des goroutines et des channels, avec un modèle très différent.

## La stratégie retenue (D-11) : exécuter de façon synchrone

Les programmes **ne font aucune vraie entrée-sortie** (ni réseau, ni fichier, ni minuterie). Chaque `await` attend donc un calcul déjà prêt. Une exécution **synchrone** donne le même ordre et le même résultat :

| TypeScript | Go |
|---|---|
| `Promise<T>` | `T` |
| `async function f()` | `func f()` |
| `await x` | `x` |
| `asyncPipe(x, f, g)` | déroulé comme `pipe` (voir [10](../10-fonctions-et-curryfication/)) |
| `asyncGroup([…])` | étapes exécutées **dans l'ordre**, arrêt à la première erreur, comme DuploJS |

## L'exemple

`exemples/` : une fonction `async` appelée avec `await` dans une boucle, entourée d'affichages qui montrent que l'ordre est conservé.

## Limite assumée

Ce choix n'est valable que **parce qu'il n'y a pas d'entrée-sortie réelle**. Un programme qui lancerait de vraies requêtes en parallèle (`Promise.all` sur des appels réseau) demanderait des goroutines. Ce n'est pas le cas des exercices.
