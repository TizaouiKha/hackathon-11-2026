# Suivi des exercices — Hackathon DuploJS TS → Go

Pour chaque projet : ce qu'il demande, notre réponse (la stratégie de traduction), le Go visé et l'état.
Les décisions transverses sont dans [DECISIONS.md](DECISIONS.md) (références `D-xx`).

États : ⬜ pas commencé · 🟨 en cours · ✅ compile et donne la bonne sortie · ❌ bloqué

| Projet | Sujet principal | État |
|---|---|---|
| [00](#projet-00) | Addition, appel de `DEither.success`, préparation d'un appel | 🟨 build OK, `go build` KO (B-01) |
| [01](#projet-01) | Union `Success \| Fail`, `if`, `isRight`, `print` | ⬜ |
| [02](#projet-02) | `whenIsRight` + fonction passée en argument | ⬜ |
| [03](#projet-03) | `pipe` + forme curryfiée | ⬜ |
| [04](#projet-04) | Plusieurs `return`, `fail()` | ⬜ |
| [05](#projet-05) | `whenIsRightOtherwise`, fonctions fléchées, `DArray.map`, `DString.to` | ⬜ |
| [06](#projet-06) | `left("info", v)`, ternaire, `matchInformation` | ⬜ |
| [07](#projet-07) | `rightPipe` | ⬜ |
| [08](#projet-08) | Tuples, déstructuration, `map` imbriqués | ⬜ |
| [09](#projet-09) | `group` (transaction) | ⬜ |
| [10](#projet-10) | `async` / `await`, `rightAsyncPipe`, `asyncGroup`, `asyncPipe` | ⬜ |

Commande (sous WSL, voir D-01) :
```bash
pnpm build --tsconfig projects/NN/tsconfig.json --input projects/NN/index.ts --output projects/NN/dist
cd projects/NN/dist && go build -o /tmp/pNN . && /tmp/pNN
```
Pour obtenir la sortie de référence côté TypeScript, on peut lancer `pnpm exec tsx projects/NN/index.ts`.

---

## Inventaire des transformers

✔ = existe déjà dans le code de départ.

**Instructions**
- ✔ appel autonome · ✔ `return expr` · ✔ bloc
- `const` / `let` (variable locale et variable du module, D-07) · `if` / `else` · `return` sans valeur

**Expressions**
- ✔ identifiant (y compris entre fichiers) · ✔ littéral numérique → `float64` · ✔ binaire arithmétique
- comparaisons, `||`, `&&` (le mapping est déjà dans `binary.ts`, à tester) · littéral de chaîne · ternaire · fonction fléchée · littéral de tableau · littéral d'objet (handlers de `matchInformation`) · `await`

**Types**
- ✔ `number`
- `string` · tableau `T[]` · tuple `[A, B, C]` · unions d'`Either` · `Promise<T>` · type de retour inféré (via le checker)

**Paramètres**
- identifiant simple ✔ · déstructuration de tuple `[a, b, c]`

**Domaine DuploJS**
- Either :
  - ✔ `success` / `Success<T>` (bug B-01) ;
  - `fail` · `left` · `isRight` · `whenIsRight` · `whenIsRightOtherwise` · `matchInformation` · `rightPipe` · `group` · `rightAsyncPipe` · `asyncGroup` ;
  - types `Fail`, `Left`.
- Common : `pipe` · `asyncPipe` · `print`
- Array : `coalescing` · `map`
- String : `to`

---

## Projet 00

**Source** : `add(one, two)` renvoie `DEither.success(one + two)`. `index.ts` appelle `add(1, 2)` au niveau du module.

**Problèmes posés** : traduire l'addition, appeler une fonction d'un module DuploJS, préserver l'ordre d'évaluation d'un appel.

**Réponse** :
- `number` devient `float64` (D-08) ;
- l'addition passe par des variables temporaires pour les opérandes (mécanisme `before`) ;
- `DEither.success` devient la shared dependency `EitherSuccessOf[T]`, qui renvoie `EitherSuccess[T]` ;
- l'appel au niveau du module part dans `init()`, et `main.go` importe le package d'entrée avec `_`.

**Go actuellement généré** (`add.ts.go`) :
```go
func Sourced_add(Sourced_one float64, Sourced_two float64) (shard_dependencies.EitherSuccess[float64]) {
	Generated_4 := shard_dependencies.EitherSuccessOf      // ❌ manque [float64]
	Generated_5 := Sourced_one
	Generated_6 := Sourced_two
	Generated_7 := Generated_5 + Generated_6
	return Generated_4(Generated_7)
}
```

**Reste à faire** :
- [ ] corriger B-01 : générer `shard_dependencies.EitherSuccessOf[float64]` ;
- [ ] (optionnel, D-06) ne plus préparer les identifiants ou littéraux.

**État** : 🟨 le build TS passe, `go build` échoue.

---

## Projet 01

**Source** : `add` déclare le retour `Success<number> | Fail`. `index.ts` contient `const result = add(1, 2)`, puis `if (DEither.isRight(result)) DCommon.print(result)`.

**Problèmes posés** : représenter un retour à plusieurs variantes ; traduire un `if`.

**Réponse prévue** :
- l'union d'`Either` devient une struct avec un tag (D-09) ;
- `return success(...)` est converti vers ce type d'union ;
- `isRight(r)` devient une comparaison de tag ;
- `print` passe par `json.Marshal` puis l'affichage (à vérifier par rapport à la sortie TS) ;
- `const result` est déclaré au niveau du module (D-07).

**Go visé** : _à remplir_

**État** : ⬜

---

## Projet 02

**Source** : `DEither.whenIsRight(result, DArray.coalescing)`.

**Problème posé** : un appel qui reçoit une fonction et ne l'applique qu'à la valeur `Right`.

**Réponse prévue** :
- dérouler en `if r.Tag == right { nouvelle = coalescing(r.Value) } else { nouvelle = r }` (D-09) ;
- `coalescing` devient une shared dependency générique.
- Point à clarifier : le type de sortie, qui est l'union des deux branches.

**Go visé** : _à remplir_

**État** : ⬜

---

## Projet 03

**Source** : `DCommon.pipe(result, DEither.whenIsRight(DArray.coalescing))`.

**Problème posé** : une composition en pipe, avec une forme curryfiée.

**Réponse prévue** : dérouler le pipe à la compilation (D-10). Chaque étape curryfiée reçoit la valeur de l'étape précédente comme premier argument, ce qui ramène au projet 02.

**Go visé** : _à remplir_

**État** : ⬜

---

## Projet 04

**Source** : `add` avec `if (one === -1) return DEither.fail();`, sans annotation de retour.

**Problème posé** : plusieurs chemins de retour.

**Réponse prévue** :
- le type de retour est inféré par le checker (`Fail | Success<number>`) et devient le type d'union de D-09 ;
- chaque `return` est converti vers ce type ;
- `===` devient `==`.

**Go visé** : _à remplir_

**État** : ⬜

---

## Projet 05

**Source** : `pipe(result, whenIsRightOtherwise(coalescing, () => [-12]), DArray.map(DString.to))`.

**Problèmes posés** : traiter différemment chaque issue ; transformer chaque élément d'une collection.

**Réponse prévue** :
- `whenIsRightOtherwise` est déroulé en `if` / `else` ;
- la fonction fléchée devient un `func` littéral (ou elle est déroulée si son corps est simple) ;
- `DArray.map` devient une boucle `for range` qui remplit un slice pré-alloué (`make([]T, 0, len(xs))`) ;
- `DString.to` utilise un formatage fidèle à JS (D-12).

**Go visé** : _à remplir_

**État** : ⬜

---

## Projet 06

**Source** : `DEither.left("negative-operand", one < 0 ? one : two)` et `matchInformation(result, { "negative-operand": ..., success: ... })`.

**Problèmes posés** : erreurs identifiées avec leur contexte ; expression ternaire.

**Réponse prévue** :
- l'information devient une constante de tag, avec sa valeur dans `Value` ;
- le ternaire devient `var t T; if cond { t = a } else { t = b }`, placé dans `before` ;
- `matchInformation` devient un `switch r.Tag { case ...: }`, et les handlers du littéral d'objet deviennent les branches.

**Go visé** : _à remplir_

**État** : ⬜

---

## Projet 07

**Source** : `DEither.rightPipe(add(1, 2), (value) => divide(value, 0))`, avec deux fichiers dépendants.

**Problème posé** : enchaîner des opérations dépendantes et s'arrêter au premier échec.

**Réponse prévue** :
- dérouler en séquence de `if r.Tag est left { résultat = r (converti) } else { r2 := divide(r.Value, 0) ... }` ;
- le type final est l'union de toutes les gauches et de la dernière droite.

**Go visé** : _à remplir_

**État** : ⬜

---

## Projet 08

**Source** : `inputs: [number, number, number][]`, `DArray.map(inputs, ([one, two, divisor]) => ...)`, puis un `map` curryfié dans un `pipe`.

**Problèmes posés** : collection de calculs ; tableau de tuples ; déstructuration dans un paramètre.

**Réponse prévue** :
- le tuple devient `[3]float64` (taille fixe, pas d'allocation) ;
- le tableau devient `[][3]float64` ;
- la déstructuration devient un paramètre `p [3]float64` suivi de `one, two, divisor := p[0], p[1], p[2]` au début du corps.

**Go visé** : _à remplir_

**État** : ⬜

---

## Projet 09

**Source** : `DEither.group(calculations)`, puis `whenIsRightOtherwise`.

**Problème posé** : regrouper des résultats et échouer dès qu'un seul échoue.

**Réponse prévue** : une boucle sur les résultats qui s'arrête au premier `left` et le renvoie ; sinon, on construit le slice des valeurs.
- Point à clarifier : quelle gauche est renvoyée (la première ?). À vérifier dans la source de `@duplojs/lang`.

**Go visé** : _à remplir_

**État** : ⬜

---

## Projet 10

**Source** : `async function calculate`, `rightAsyncPipe`, `asyncGroup([() => ...])`, `asyncPipe`, `await`.

**Problèmes posés** : composer des résultats asynchrones ; représenter `Promise` / `await` en Go.

**Réponse prévue** :
- exécution synchrone (D-11) : `async` et `await` disparaissent, et `Promise<T>` devient `T` ;
- `asyncGroup` exécute les thunks dans l'ordre (à vérifier : la lib DuploJS les lance-t-elle en parallèle ? Comme aucun effet de bord n'est observable, le résultat reste le même).

**Go visé** : _à remplir_

**État** : ⬜
