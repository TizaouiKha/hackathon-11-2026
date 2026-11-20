# Historique · Fonctions et curryfication

## `pipe` (D-10)

| Piste | Verdict |
|---|---|
| Un helper générique `Pipe(x, f, g, …)` | ❌ Impossible en Go : il n'y a pas de génériques variadiques, chaque étape peut changer le type. |
| `Pipe2`, `Pipe3`… `Pipe10` | ❌ Possible, mais limité à un nombre d'étapes et verbeux. |
| **Dérouler à la compilation** | ✅ Une variable par étape, dans l'ordre de JS : l'entrée, puis les fonctions elles-mêmes, puis les appels. Pas d'appel supplémentaire. |

## Les formes curryfiées (D-10, puis D-17)

- **Première version** : une forme curryfiée n'était traduite **qu'à l'intérieur d'un `pipe`**, en « injectant » la donnée du `pipe`. Le Go était court.
- **Problème** : le projet 08 passe une forme curryfiée à `DArray.map`, hors de tout `pipe`.
- **Décision D-17** : une forme curryfiée devient une **vraie fonction Go littérale**, utilisable partout. Son type vient de la signature **instanciée par le checker** à cet endroit. Chaque helper est écrit une seule fois, comme une « opération » qui reçoit son entrée. La forme avec données et la forme curryfiée la partagent, sans code dupliqué.

## Les callbacks (D-09.5)

TypeScript accepte un callback qui ignore ses paramètres (`() => -1`). Go exige la signature exacte. Le callback est donc **enveloppé** dans une fonction qui reçoit tout et ne transmet que ce qu'il déclare. Le callback est évalué une fois, avant.

## Les fonctions Duplo passées en valeur (D-25, D-26)

En Duplo, on passe très souvent une fonction directement (`DArray.filter(list, DNumber.isEven)`). C'est pourquoi les fonctions `DNumber` ont **un helper Go par fonction** : `DNumber.isEven` devient simplement `shard_dependencies.NumberIsEven`, une vraie fonction Go. Pour une fonction générique, comme `DCommon.truthy` passée à `filter`, on génère une fonction littérale typée par le contexte.

## Bug trouvé en route

`DArray.map(list, DCommon.justReturn(0))` ne compilait pas : la fonction générée prenait la signature du **contexte** (deux paramètres, ceux de `map`) au lieu de **la sienne** (un paramètre). On utilise maintenant la signature propre de l'appel.
