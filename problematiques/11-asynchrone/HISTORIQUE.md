# Historique · L'asynchrone

## Pistes explorées

| Piste | Idée | Verdict |
|---|---|---|
| **Goroutines + channels** | Chaque `Promise` devient une goroutine, et `await` lit un channel | ❌ Pour ces programmes. Ça ajoute de la concurrence là où il n'y en a pas, rend l'ordre des affichages plus difficile à garantir, et coûte une goroutine par promesse. Gardé comme **bonus** éventuel. |
| **Un type `Future[T]`** | Imiter `Promise` en Go | ❌ Beaucoup de code pour un comportement qu'aucun exercice n'exerce. |
| **Exécution synchrone** | `Promise<T>` → `T`, `await x` → `x` | ✅ **Retenue (D-11)** |

## Pourquoi c'est correct ici

En JavaScript, `await` cède la main **seulement** s'il y a quelque chose d'autre à faire. Sans entrée-sortie ni minuterie, chaque promesse est déjà résolue : le programme se déroule dans le même ordre que sa version synchrone. `check.sh 10` le confirme : la sortie est identique à celle de TypeScript.

## Les détails tranchés

- **`asyncGroup`** : on a lu l'implémentation de DuploJS. Les étapes sont exécutées **l'une après l'autre**, et la première erreur arrête tout. Le helper Go fait exactement ça, que les étapes soient des fonctions ou des Either déjà calculés.
- **La forme objet de `asyncGroup`** devient un struct Go typé, et garde les clés.
- **Un tableau qui mélange fonctions et valeurs** est traduit quand le transpileur voit le tableau littéral (il connaît le type de chaque position). Le même tableau reçu d'un autre module est refusé : il faudrait de la réflexion.
- **`rightAsyncPipe`** réutilise le helper `RightThen` du `rightPipe` synchrone.

**Vérifié** : `tests/async` (20 contrôles), `check.sh 10`.
