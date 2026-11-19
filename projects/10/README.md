# Projet 10

## Problématique

### Composer des résultats asynchrones

Dans `index.ts`, les calculs asynchrones produisent des résultats `Either`. `DEither.rightAsyncPipe` enchaîne les étapes d’un calcul, `DEither.asyncGroup` regroupe plusieurs calculs, puis `DCommon.asyncPipe` compose le traitement final. Comment traduire ces compositions en préservant l’ordre d’exécution asynchrone, la propagation des échecs et le résultat final attendu ?

### Représenter l’asynchronisme TypeScript en Go

TypeScript exprime ici l’asynchronisme avec des fonctions `async`, des valeurs `Promise` et `await`. Go ne possède pas ces constructions ni le même modèle de promesse. Comment traduire ce flux asynchrone en Go sans modifier l’ordre des opérations ni le moment où les résultats deviennent disponibles ?

## Solution

Le projet ne réalise aucune entrée/sortie réellement asynchrone. Conformément à
D-11, le Go généré s'exécute donc de manière synchrone : `Promise<T>` devient
`T`, les mots-clés `async` et `await` disparaissent, et les étapes gardent leur
ordre d'origine.

`rightAsyncPipe` utilise la même chaîne de `RightThen` que `rightPipe` et arrête
le traitement au premier `Left`. `asyncGroup` appelle chaque fonction dans
l'ordre, retourne immédiatement le premier `Left`, ou regroupe toutes les
valeurs dans un `Success`. Il accepte les tableaux homogènes ou mixtes ainsi que
les objets littéraux ; les objets deviennent des structs Go qui conservent leurs
clés et le type de chaque propriété. Enfin, `asyncPipe` est déroulé en appels
successifs, comme sa version synchrone.

Cette stratégie conserve le résultat observable du programme sans introduire de
goroutines ou de channels inutiles. `./.commands/check.sh 10` confirme que la
sortie Go est identique à celle de TypeScript.
