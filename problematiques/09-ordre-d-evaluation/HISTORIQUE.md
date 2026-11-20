# Historique · L'ordre d'évaluation

## 1. Première version : tout copier (étape 5, D-06)

Le helper de préparation rangeait **chaque** opérande dans une variable temporaire. C'était correct, mais le Go devenait illisible : `Generated_1 := a`, `Generated_2 := b`, `Generated_3 := Generated_1 + Generated_2`.

## 2. Optimisation : ne plus copier les noms (étape 5, relue en R-01)

`transformPrepared` a cessé de copier les identifiants et les littéraux. Le Go est redevenu lisible (`Value: one + two`). La relecture R-01 (18/11) a signalé le risque :

> Si un argument **suivant** modifie la variable, Go lira la nouvelle valeur alors que JavaScript lit l'ancienne : `f(x, change())`.

À ce moment-là, aucun transformeur ne traduisait encore d'affectation : le cas était impossible, donc noté « à corriger dès que les affectations existent ».

## 3. Le bug devenu réel, puis corrigé (19/11)

Les affectations sont arrivées (D-19). Un test a confirmé le bug : `pair(x, change())` donnait `[ 10, 0 ]` au lieu de `[ 1, 0 ]`.

| Piste | Verdict |
|---|---|
| Revenir à « tout copier » | ❌ Correct, mais le Go redevient illisible. |
| Copier tous les noms quand un opérande suivant a des instructions préparatoires | ⚠️ Correct, mais des copies inutiles pour les constantes et les fonctions. |
| **Copier seulement ce qui peut changer** | ✅ **Retenue**. Un nom n'est copié que s'il désigne un `let` ou un paramètre **réaffecté quelque part** dans son fichier. La recherche se fait par nom, donc elle est prudente : elle copie parfois pour rien, jamais l'inverse. |

## 4. Le cas de l'objet littéral

`{ a: log("a"), b: same(log("b")) }` exécutait `log("b")` **avant** `log("a")` : l'appel imbriqué était sorti avant l'objet. Les valeurs d'un objet sont maintenant préparées comme des arguments d'appel, puis mises en ordre.

## 5. Ce qui n'en a pas besoin

Les template strings : chaque morceau devient un appel (`JSToString(x)`), et Go garantit l'ordre des appels.

## Est-ce important pour du code Duplo ?

Peu, et c'est assumé. Le lint Duplo impose `prefer-const` et interdit de réaffecter un paramètre, et les exercices ne contiennent aucun `let`. Le correctif coûte presque rien (aucune copie pour du code en `const`) et protège le code TypeScript ordinaire.

**Vérifié** : `tests/evaluation-order` (9 cas comparés à Node).
