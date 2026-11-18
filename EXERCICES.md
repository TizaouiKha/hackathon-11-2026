# Suivi des exercices — Hackathon DuploJS TS → Go

Pour chaque projet : ce qu'il demande, notre réponse (la stratégie de traduction), le Go visé et l'état.
Les décisions transverses sont dans [DECISIONS.md](DECISIONS.md) (références `D-xx`).

États : ⬜ pas commencé · 🟨 en cours · ✅ compile et donne la bonne sortie · ❌ bloqué

| Projet | Sujet principal | État |
|---|---|---|
| [00](#projet-00) | Addition, appel de `DEither.success`, préparation d'un appel | ✅ |
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

**Valider un projet** (sous WSL, voir D-01 et D-14) :
```bash
./.commands/check.sh NN
```
Ce script transpile, compile et exécute le Go, puis compare sa sortie à celle du TypeScript.

## Sorties de référence (ce que le Go doit afficher)

Ces sorties ont été obtenues en exécutant chaque `index.ts` avec `tsx`. `print` utilise le format `util.inspect` de Node (D-13).

| Projet | Sortie attendue |
|---|---|
| 00 | _(rien)_ |
| 01 | l'objet Success ci-dessous |
| 02, 03 | l'objet Success ci-dessous, puis `[ 3 ]` |
| 04 | l'objet Fail ci-dessous, une seule fois : `isRight` est faux, et `whenIsRight` laisse passer le fail tel quel, puis `print(newResult)` l'affiche |
| 05 | l'objet Success, puis `[ '3' ]` |
| 06 | `[ '-12' ]`, puis `un opérande est négatif` |
| 07 | `[ '-12' ]`, puis `division par zéro impossible` |
| 08 | `[ '3', '3', 'échec' ]` |
| 09 | `[ 'transaction annulée' ]` |
| 10 | `[ 'transaction annulée' ]` |

Objet Success :
```
{
  '@duplojs/lang/kind/@DuplojsLangEither/right': null,
  '@duplojs/lang/kind/@DuplojsLangEither/information': 'success',
  '@duplojs/lang/kind/@DuplojsLangEither/value': 3,
  '@duplojs/lang/kind/@DuplojsLangEither/success': null
}
```
Objet Fail (projet 04) :
```
{
  '@duplojs/lang/kind/@DuplojsLangEither/left': null,
  '@duplojs/lang/kind/@DuplojsLangEither/information': 'fail',
  '@duplojs/lang/kind/@DuplojsLangEither/value': undefined,
  '@duplojs/lang/kind/@DuplojsLangEither/fail': null
}
```

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

**Go généré** (`add.ts.go`), avec la représentation Either de l'étape 3 (D-09) :
```go
func Sourced_add(Sourced_one float64, Sourced_two float64) (shard_dependencies.Either[float64]) {
	Generated_4 := Sourced_one
	Generated_5 := Sourced_two
	return (shard_dependencies.Either[float64]{
		Tag: shard_dependencies.TagRightSuccess,
		Value: Generated_4 + Generated_5,
	})
}
```
`DEither.success(x)` devient directement un littéral de struct : pas d'appel de fonction ni de variable intermédiaire.

**Fait / reste à faire** :
- [x] corriger B-01. Cette correction est maintenant remplacée par l'étape 3, qui supprime `EitherSuccessOf` ;
- [ ] (étape 5, D-06) ne plus préparer les identifiants ou littéraux.

**État** : ✅ `./.commands/check.sh 00` passe (compile, s'exécute, sortie identique : rien).

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
- appel du helper générique `WhenIsRight(r, coalescing)` (D-09.3), qui applique `coalescing` seulement si `r` est une droite ;
- `coalescing` devient une shared dependency générique.
- Point à clarifier : le type de sortie, qui est l'union des deux branches.

**Go visé** : _à remplir_

**État** : ⬜

---

## Projet 03

**Source** : `DCommon.pipe(result, DEither.whenIsRight(DArray.coalescing))`.

**Problème posé** : une composition en pipe, avec une forme curryfiée.

**Réponse prévue** : dérouler le pipe à la compilation (D-10) : `t1 := result`, puis `t2 := WhenIsRight(t1, coalescing)`. Chaque étape curryfiée reçoit la valeur de l'étape précédente comme premier argument, ce qui ramène au projet 02.

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
- `whenIsRightOtherwise` devient un appel au helper `WhenIsRightOtherwise(r, f, g)` (D-09.3) ;
- la fonction fléchée `() => [-12]` devient un `func` littéral Go ;
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
- `matchInformation` devient `MatchInformation(r, handlers)`, où `handlers` est un slice de fonctions rangé par numéro de tag : la fonction de `"negative-operand"` est rangée à l'indice `TagNegativeOperand`, etc. (D-09.3).

**Go visé** : _à remplir_

**État** : ⬜

---

## Projet 07

**Source** : `DEither.rightPipe(add(1, 2), (value) => divide(value, 0))`, avec deux fichiers dépendants.

**Problème posé** : enchaîner des opérations dépendantes et s'arrêter au premier échec.

**Réponse prévue** :
- `rightPipe(r, f, g)` devient des appels emboîtés au helper à deux arguments `RightThen(RightThen(r, f), g)`. `RightThen` renvoie `r` tel quel si c'est une gauche, sinon `f(r.Value)` (D-09.3) ;
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

**Réponse prévue** : le helper `Group(rs)` boucle sur les résultats, s'arrête au premier `left` et le renvoie ; sinon, il construit le slice des valeurs.
- **Type de retour** : `Success<number[]> | Left<…, number>`. Le succès est un tableau et l'erreur un nombre, donc on utilise **`Either2[[]float64, float64]`** (D-09.2). C'est le premier projet qui en a besoin.
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
