# Suivi des exercices — Hackathon DuploJS TS → Go

Pour chaque projet : ce qu'il demande, notre réponse (la stratégie de traduction), le Go obtenu et l'état.

**Bilan (19/11, étape 9)** : les projets **00 à 09 passent** (`check.sh`, sortie identique à TypeScript). Il reste le projet 10 (asynchrone, étape 10).

Les décisions transverses sont dans [DECISIONS.md](DECISIONS.md) (références `D-xx`).

États : ⬜ pas commencé · 🟨 en cours · ✅ compile et donne la bonne sortie · ❌ bloqué

| Projet | Sujet principal | État |
|---|---|---|
| [00](#projet-00) | Addition, appel de `DEither.success`, préparation d'un appel | ✅ |
| [01](#projet-01) | Union `Success \| Fail`, `if`, `isRight`, `print` | ✅ |
| [02](#projet-02) | `whenIsRight` + fonction passée en argument | ✅ |
| [03](#projet-03) | `pipe` + forme curryfiée | ✅ |
| [04](#projet-04) | Plusieurs `return`, `fail()` | ✅ |
| [05](#projet-05) | `whenIsRightOtherwise`, fonctions fléchées, `DArray.map`, `DString.to` | ✅ |
| [06](#projet-06) | `left("info", v)`, ternaire, `matchInformation` | ✅ |
| [07](#projet-07) | `rightPipe` | ✅ |
| [08](#projet-08) | Tuples, déstructuration, `map` imbriqués | ✅ |
| [09](#projet-09) | `group` (transaction) | ✅ |
| [10](#projet-10) | `async` / `await`, `rightAsyncPipe`, `asyncGroup`, `asyncPipe` | ✅ |

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

✔ = implémenté et couvert par les tests.

**Instructions**
- ✔ appel autonome · ✔ `return expr` · ✔ bloc
- ✔ `const` / `let` avec un identifiant et un initialiseur (variable locale et variable du module, D-07) · ✔ `if` / `else` · ✔ `return` sans valeur
- ✔ affectation, `+=`, `++` · ✔ `for…of`, `while`, `for`, `break`, `continue` · ✔ `switch` (avec `fallthrough`) · ✔ déstructuration de tableau et d'objet (D-19)

**Expressions**
- ✔ identifiant (y compris entre fichiers) · ✔ littéral numérique → `float64` · ✔ binaire arithmétique
- ✔ comparaisons, `||`, `&&` · ✔ littéral de chaîne · ✔ unaires · ✔ parenthèses · ✔ ternaire · ✔ fonction fléchée · ✔ littéral de tableau/tuple · ✔ littéral d'objet des handlers de `matchInformation` · ✔ adaptation au narrowing et élargissement vers un Either (D-18.2)
- ✔ accès à une propriété et à un élément · ✔ `.length` · ✔ littéral d'objet · ✔ template string · ✔ `typeof` · ✔ `??` · ✔ `Math.*` (D-19)
- ✔ `true` / `false` · ✔ objet `any` utilisé comme objet typé (`JSAs`) · ✔ propriété lue sur un `any` (`JSGetProperty`) (D-20)
- ✔ **objet plus grand passé à un type plus petit** (`test(user)` avec `test(arg: { name: string })`) : objet temporaire construit à la compilation, y compris imbriqué et tableau d'objets (D-21)
- ✔ **`DArray`** : `map`, `coalescing`, `filter`, `find`, `findIndex`, `some`, `every`, `includes`, `push`, `concat`, `length`, avec données et curryfiées (D-22) · `reduce` avec `next` / `exit` / `nextPush`, `reduceFrom` (D-23)
- ✔ **`DObject`** : `pick`, `omit`, `assign`, `override`, `getProperty`, `getDeepProperty`, `transformProperty`, `keys`, `values`, `entries`, `countKeys` (D-24)
- ⬜ `?.` · ⬜ `await` (projet 10)

**Types**
- ✔ `number`
- ✔ `string` · ✔ `boolean` · ✔ `null` / `undefined` · ✔ tableau `T[]` · ✔ tuple (une slice, D-18.5) · ✔ objet (struct anonyme) · ✔ `Record<string, T>` · ✔ fonction · ✔ unions d'`Either` (`EitherAny`) · ✔ `Promise<T>` · ✔ type de retour inféré · ✔ `type` / `interface` ignorés (D-18.6). Le tout dans **`tsTypeToGo`** (D-18).

**Paramètres**
- identifiant simple ✔ · déstructuration de tuple `[a, b, c]` ✔ · déstructuration d'objet `{ index }` ✔

**Validation de l'étape 6** : `tests/language-basics/` couvre 32 cas à
l'exécution, dont les variables module/locales, les deux branches d'un ternaire,
les deux formes de fonction fléchée, les tableaux et les tuples homogènes et
hétérogènes.

**Domaine DuploJS**
- Either :
  - ✔ `success` · ✔ `fail` · ✔ `left` · ✔ `right` · ✔ `error` · ✔ `isRight` · ✔ `isLeft` · ✔ `unwrapRight` · ✔ `whenIsRight` · ✔ `whenIsRightOtherwise` · ✔ `matchInformation` · ✔ `rightPipe` · ✔ `group` (tableau et objet) ;
  - ⬜ `rightAsyncPipe` · ⬜ `asyncGroup` (projet 10) ;
  - ✔ types `Success`, `Fail`, `Error`, `Left`, `Right` et leurs unions.
- Common : ✔ `pipe` · ✔ `print` · ⬜ `asyncPipe` (projet 10)
- Array : ✔ `coalescing` · ✔ `map`
- String : ✔ `to` · ✔ `length`, `slice`, `substring`, `charAt`, `at`, `indexOf`, `includes`, `startsWith`, `endsWith`, `toUpperCase`, `toLowerCase` (D-18.4)

---

## Projet 00

**Source** : `add(one, two)` renvoie `DEither.success(one + two)`. `index.ts` appelle `add(1, 2)` au niveau du module.

**Problèmes posés** : traduire l'addition, appeler une fonction d'un module DuploJS, préserver l'ordre d'évaluation d'un appel.

**Réponse** :
- `number` devient `float64` (D-08) ;
- l'addition utilise directement les deux paramètres grâce au helper de préparation (D-06) ;
- `DEither.success` devient un littéral de struct `EitherAny` (D-18) ;
- l'appel au niveau du module part dans `init()`, et `main.go` importe le package d'entrée avec `_`.

**Go généré** (`add.ts.go`), avec `EitherAny` (D-18) :
```go
func Sourced_add(Sourced_one float64, Sourced_two float64) (shard_dependencies.EitherAny) {
	return (shard_dependencies.EitherAny{
		Tag: shard_dependencies.TagRightSuccess,
		Value: Sourced_one + Sourced_two,
	})
}
```
`DEither.success(x)` devient directement un littéral de struct : pas d'appel de fonction. Grâce au helper de préparation (étape 5), l'addition n'a plus de variables temporaires.

**Fait / reste à faire** :
- [x] corriger B-01. Cette correction est maintenant remplacée par l'étape 3, qui supprime `EitherSuccessOf` ;
- [x] (étape 5, D-06) utiliser directement les identifiants et littéraux du projet 00.

**État** : ✅ `./.commands/check.sh 00` passe (compile, s'exécute, sortie identique : rien).

---

## Projet 01

**Source** : `add` déclare le retour `Success<number> | Fail`. `index.ts` contient `const result = add(1, 2)`, puis `if (DEither.isRight(result)) DCommon.print(result)`.

**Problèmes posés** : représenter un retour à plusieurs variantes ; traduire un `if`.

**Réponse** :
- l'union d'`Either` devient un `EitherAny` (tag entier + valeur, D-09 et D-18) ;
- `isRight(r)` devient `r.Tag.IsRight()` (une table indexée par le tag) ;
- `print` reproduit `util.inspect` de Node par réflexion (étape 4), sans JSON ;
- `const result` est déclaré au niveau du module et initialisé dans `init()` (D-07).

**Go obtenu** : `result` est une variable de package initialisée dans `init()`,
puis le `if` appelle la méthode de test du tag et le printer partagé.

**État** : ✅ `./.commands/check.sh 01` passe (transpilation, compilation et sortie identique à TypeScript).

---

## Projet 02

**Source** : `DEither.whenIsRight(result, DArray.coalescing)`.

**Problème posé** : un appel qui reçoit une fonction et ne l'applique qu'à la valeur `Right`.

**Réponse** :
- appel du helper générique `WhenIsRight(r, f)` (D-09.3), qui applique `f` seulement si `r` est une droite, et range le résultat brut avec `TagValue` (D-16) ;
- `DArray.coalescing`, passé comme fonction, devient une fonction Go littérale typée par le contexte. Le « tableau ou valeur ? » est **décidé à la compilation** (`number` → `[]float64{v}`, D-18.5) ;
- le type de sortie (`readonly [number] | Fail`) est un `EitherAny`.

**Go obtenu** (`projects/02/dist/index.ts/index.ts.go`, étape 9) :

<details>
<summary>Afficher le Go généré</summary>

Les noms de package sont abrégés ici (`add_ts`) : le transpileur les écrit encore avec le chemin absolu du fichier (bug B-02, étape 11).

```go
import "duplojs.local/transpiled/add.ts"
import "duplojs.local/transpiled/shard_dependencies"

var Sourced_result shard_dependencies.EitherAny

var Sourced_newResult shard_dependencies.EitherAny

func init() {
	Sourced_result = add_ts.Sourced_add((float64)(1), (float64)(2))
	Generated_1 := Sourced_result.Tag.IsRight()
	if Generated_1 {
		Generated_2 := shard_dependencies.Print[any]
		Generated_2(Sourced_result)
	}
	Sourced_newResult = shard_dependencies.WhenIsRight(Sourced_result, func(Generated_3 float64) ([]float64) {
		return ([]float64{
			Generated_3,
		})
	})
	Generated_4 := shard_dependencies.Print[any]
	Generated_4(Sourced_newResult)
}
```

</details>

**État** : ✅ `./.commands/check.sh 02` passe (transpilation, compilation et sortie identique à TypeScript).

---

## Projet 03

**Source** : `DCommon.pipe(result, DEither.whenIsRight(DArray.coalescing))`.

**Problème posé** : une composition en pipe, avec une forme curryfiée.

**Réponse** : dérouler le pipe à la compilation (D-10) : `t1 := result`, puis `t2 := WhenIsRight(t1, coalescing)`. Chaque étape curryfiée reçoit la valeur de l'étape précédente comme premier argument, ce qui ramène au projet 02.

**Go obtenu** (`projects/03/dist/index.ts/index.ts.go`, étape 9) :

<details>
<summary>Afficher le Go généré</summary>

Les noms de package sont abrégés ici (`add_ts`) : le transpileur les écrit encore avec le chemin absolu du fichier (bug B-02, étape 11).

```go
import "duplojs.local/transpiled/add.ts"
import "duplojs.local/transpiled/shard_dependencies"

var Sourced_result shard_dependencies.EitherAny

var Sourced_newResult shard_dependencies.EitherAny

func init() {
	Sourced_result = add_ts.Sourced_add((float64)(1), (float64)(2))
	Generated_1 := Sourced_result.Tag.IsRight()
	if Generated_1 {
		Generated_2 := shard_dependencies.Print[any]
		Generated_2(Sourced_result)
	}
	Generated_3 := Sourced_result
	Generated_6 := func(Generated_4 shard_dependencies.EitherAny) (shard_dependencies.EitherAny) {
		return shard_dependencies.WhenIsRight(Generated_4, func(Generated_5 float64) ([]float64) {
			return ([]float64{
				Generated_5,
			})
		})
	}
	Generated_7 := Generated_6(Generated_3)
	Sourced_newResult = Generated_7
	Generated_8 := shard_dependencies.Print[any]
	Generated_8(Sourced_newResult)
}
```

</details>

**État** : ✅ `./.commands/check.sh 03` passe (transpilation, compilation et sortie identique à TypeScript).

---

## Projet 04

**Source** : `add` avec `if (one === -1) return DEither.fail();`, sans annotation de retour.

**Problème posé** : plusieurs chemins de retour.

**Réponse** :
- le type de retour est inféré par le checker (`Fail | Success<number>`) et devient un `EitherAny` ;
- chaque `return` produit directement un `EitherAny` (`fail` et `success` sont des littéraux de struct) ;
- `===` devient `==`, et `-1` passe par le moins unaire (étape 6).

**Go obtenu** (`projects/04/dist/index.ts/index.ts.go`, étape 9) :

<details>
<summary>Afficher le Go généré</summary>

Les noms de package sont abrégés ici (`add_ts`) : le transpileur les écrit encore avec le chemin absolu du fichier (bug B-02, étape 11).

```go
import "duplojs.local/transpiled/add.ts"
import "duplojs.local/transpiled/shard_dependencies"

var Sourced_result shard_dependencies.EitherAny

var Sourced_newResult shard_dependencies.EitherAny

func init() {
	Generated_1 := -((float64)(1))
	Sourced_result = add_ts.Sourced_add(Generated_1, (float64)(2))
	Generated_2 := Sourced_result.Tag.IsRight()
	if Generated_2 {
		Generated_3 := shard_dependencies.Print[any]
		Generated_3(Sourced_result)
	}
	Generated_4 := Sourced_result
	Generated_7 := func(Generated_5 shard_dependencies.EitherAny) (shard_dependencies.EitherAny) {
		return shard_dependencies.WhenIsRight(Generated_5, func(Generated_6 float64) ([]float64) {
			return ([]float64{
				Generated_6,
			})
		})
	}
	Generated_8 := Generated_7(Generated_4)
	Sourced_newResult = Generated_8
	Generated_9 := shard_dependencies.Print[any]
	Generated_9(Sourced_newResult)
}
```

</details>

**État** : ✅ `./.commands/check.sh 04` passe (transpilation, compilation et sortie identique à TypeScript).

---

## Projet 05

**Source** : `pipe(result, whenIsRightOtherwise(coalescing, () => [-12]), DArray.map(DString.to))`.

**Problèmes posés** : traiter différemment chaque issue ; transformer chaque élément d'une collection.

**Réponse** :
- `whenIsRightOtherwise` devient un appel au helper `WhenIsRightOtherwise(r, f, g)` (D-09.3) ;
- la fonction fléchée `() => [-12]` devient un `func` littéral Go, enveloppé parce qu'elle déclare moins de paramètres que ce qu'elle reçoit ;
- `readonly [number] | number[]` est une seule slice `[]float64` (D-18.5) ;
- `DArray.map` devient le helper `Map[T, U]`, qui alloue la slice de sortie une seule fois à sa taille ;
- `DString.to` utilise un formatage fidèle à JS (D-12).

**Go obtenu** (`projects/05/dist/index.ts/index.ts.go`, étape 9) :

<details>
<summary>Afficher le Go généré</summary>

Les noms de package sont abrégés ici (`add_ts`) : le transpileur les écrit encore avec le chemin absolu du fichier (bug B-02, étape 11).

```go
import "duplojs.local/transpiled/add.ts"
import "duplojs.local/transpiled/shard_dependencies"

var Sourced_result shard_dependencies.EitherAny

var Sourced_newResult []string

func init() {
	Sourced_result = add_ts.Sourced_add((float64)(1), (float64)(2))
	Generated_1 := Sourced_result.Tag.IsRight()
	if Generated_1 {
		Generated_2 := shard_dependencies.Print[any]
		Generated_2(Sourced_result)
	}
	Generated_3 := Sourced_result
	Generated_7 := func() ([]float64) {
		Generated_6 := -((float64)(12))
		return ([]float64{
			Generated_6,
		})
	}
	Generated_8 := func(Generated_4 shard_dependencies.EitherAny) ([]float64) {
		return shard_dependencies.WhenIsRightOtherwise(Generated_4, func(Generated_5 float64) ([]float64) {
			return ([]float64{
				Generated_5,
			})
		}, func(_ shard_dependencies.EitherAny) ([]float64) {
			return Generated_7()
		})
	}
	Generated_10 := shard_dependencies.JSNumberToString
	Generated_12 := func(Generated_9 []float64) ([]string) {
		return shard_dependencies.Map(Generated_9, func(Generated_11 float64, _ struct {
			Sourced_index float64 "json:\"index\""
			Sourced_self []float64 "json:\"self\""
		}) (string) {
			return Generated_10(Generated_11)
		})
	}
	Generated_13 := Generated_8(Generated_3)
	Generated_14 := Generated_12(Generated_13)
	Sourced_newResult = Generated_14
	Generated_15 := shard_dependencies.Print[any]
	Generated_15(Sourced_newResult)
}
```

</details>

**État** : ✅ `./.commands/check.sh 05` passe (transpilation, compilation et sortie identique à TypeScript).

---

## Projet 06

**Source** : `DEither.left("negative-operand", one < 0 ? one : two)` et `matchInformation(result, { "negative-operand": ..., success: ... })`.

**Problèmes posés** : erreurs identifiées avec leur contexte ; expression ternaire.

**Réponse** :
- l'information devient une constante de tag (`TagLeftNegativeOperand`), avec sa valeur dans `Value` ;
- le ternaire devient `var t T; if cond { t = a } else { t = b }`, placé dans `before` ;
- `matchInformation` devient `MatchInformation(r, handlers)`, où `handlers` est un slice de fonctions rangé par numéro de tag : la fonction de `"negative-operand"` est rangée à l'indice `TagNegativeOperand`, etc. (D-09.3).

**Go obtenu** (`projects/06/dist/index.ts/index.ts.go`, étape 9) :

<details>
<summary>Afficher le Go généré</summary>

Les noms de package sont abrégés ici (`add_ts`) : le transpileur les écrit encore avec le chemin absolu du fichier (bug B-02, étape 11).

```go
import "duplojs.local/transpiled/add.ts"
import "duplojs.local/transpiled/shard_dependencies"

var Sourced_result shard_dependencies.EitherAny

var Sourced_newResult []string

var Sourced_message string

func init() {
	Generated_1 := -((float64)(1))
	Sourced_result = add_ts.Sourced_add(Generated_1, (float64)(2))
	Generated_2 := Sourced_result.Tag.IsRight()
	if Generated_2 {
		Generated_3 := shard_dependencies.Print[any]
		Generated_3(Sourced_result)
	}
	Generated_4 := Sourced_result
	Generated_8 := func() ([]float64) {
		Generated_7 := -((float64)(12))
		return ([]float64{
			Generated_7,
		})
	}
	Generated_9 := func(Generated_5 shard_dependencies.EitherAny) ([]float64) {
		return shard_dependencies.WhenIsRightOtherwise(Generated_5, func(Generated_6 float64) ([]float64) {
			return ([]float64{
				Generated_6,
			})
		}, func(_ shard_dependencies.EitherAny) ([]float64) {
			return Generated_8()
		})
	}
	Generated_11 := shard_dependencies.JSNumberToString
	Generated_13 := func(Generated_10 []float64) ([]string) {
		return shard_dependencies.Map(Generated_10, func(Generated_12 float64, _ struct {
			Sourced_index float64 "json:\"index\""
			Sourced_self []float64 "json:\"self\""
		}) (string) {
			return Generated_11(Generated_12)
		})
	}
	Generated_14 := Generated_9(Generated_4)
	Generated_15 := Generated_13(Generated_14)
	Sourced_newResult = Generated_15
	Generated_16 := func() (string) {
		return "un opérande est négatif"
	}
	Generated_17 := func(Sourced_value float64) (string) {
		return shard_dependencies.JSNumberToString(Sourced_value)
	}
	Sourced_message = shard_dependencies.MatchInformation(Sourced_result, ([]func(p0 any) (string){
		shard_dependencies.TagLeftNegativeOperand: func(_ any) (string) {
			return Generated_16()
		},
		shard_dependencies.TagRightSuccess: func(Generated_18 any) (string) {
			return Generated_17(Generated_18.(float64))
		},
	}))
	Generated_19 := shard_dependencies.Print[any]
	Generated_19(Sourced_newResult)
	Generated_20 := shard_dependencies.Print[any]
	Generated_20(Sourced_message)
}
```

</details>

**État** : ✅ `./.commands/check.sh 06` passe (transpilation, compilation et sortie identique à TypeScript).

---

## Projet 07

**Source** : `DEither.rightPipe(add(1, 2), (value) => divide(value, 0))`, avec deux fichiers dépendants.

**Problème posé** : enchaîner des opérations dépendantes et s'arrêter au premier échec.

**Réponse** :
- `rightPipe(r, f, g)` devient des appels emboîtés au helper à deux arguments `RightThen(RightThen(r, f), g)`. `RightThen` renvoie `r` tel quel si c'est une gauche, sinon `f(r.Value)` (D-09.3) ;
- le type final (l'union de toutes les gauches et de la dernière droite) est un `EitherAny`.

**Go obtenu** (`projects/07/dist/index.ts/index.ts.go`, étape 9) :

<details>
<summary>Afficher le Go généré</summary>

Les noms de package sont abrégés ici (`add_ts`) : le transpileur les écrit encore avec le chemin absolu du fichier (bug B-02, étape 11).

```go
import "duplojs.local/transpiled/add.ts"
import "duplojs.local/transpiled/divide.ts"
import "duplojs.local/transpiled/shard_dependencies"

var Sourced_result shard_dependencies.EitherAny

var Sourced_newResult []string

var Sourced_message string

func init() {
	Sourced_result = shard_dependencies.RightThen(add_ts.Sourced_add((float64)(1), (float64)(2)), func(Sourced_value float64) (shard_dependencies.EitherAny) {
		return divide_ts.Sourced_divide(Sourced_value, (float64)(0))
	})
	Generated_1 := Sourced_result.Tag.IsRight()
	if Generated_1 {
		Generated_2 := shard_dependencies.Print[any]
		Generated_2(Sourced_result)
	}
	Generated_3 := Sourced_result
	Generated_7 := func() ([]float64) {
		Generated_6 := -((float64)(12))
		return ([]float64{
			Generated_6,
		})
	}
	Generated_8 := func(Generated_4 shard_dependencies.EitherAny) ([]float64) {
		return shard_dependencies.WhenIsRightOtherwise(Generated_4, func(Generated_5 float64) ([]float64) {
			return ([]float64{
				Generated_5,
			})
		}, func(_ shard_dependencies.EitherAny) ([]float64) {
			return Generated_7()
		})
	}
	Generated_10 := shard_dependencies.JSNumberToString
	Generated_12 := func(Generated_9 []float64) ([]string) {
		return shard_dependencies.Map(Generated_9, func(Generated_11 float64, _ struct {
			Sourced_index float64 "json:\"index\""
			Sourced_self []float64 "json:\"self\""
		}) (string) {
			return Generated_10(Generated_11)
		})
	}
	Generated_13 := Generated_8(Generated_3)
	Generated_14 := Generated_12(Generated_13)
	Sourced_newResult = Generated_14
	Generated_15 := func() (string) {
		return "un opérande est négatif"
	}
	Generated_16 := func() (string) {
		return "division par zéro impossible"
	}
	Generated_17 := shard_dependencies.JSNumberToString
	Sourced_message = shard_dependencies.MatchInformation(Sourced_result, ([]func(p0 any) (string){
		shard_dependencies.TagLeftNegativeOperand: func(_ any) (string) {
			return Generated_15()
		},
		shard_dependencies.TagLeftDivisionByZero: func(_ any) (string) {
			return Generated_16()
		},
		shard_dependencies.TagRightSuccess: func(Generated_18 any) (string) {
			return Generated_17(Generated_18.(float64))
		},
	}))
	Generated_19 := shard_dependencies.Print[any]
	Generated_19(Sourced_newResult)
	Generated_20 := shard_dependencies.Print[any]
	Generated_20(Sourced_message)
}
```

</details>

**État** : ✅ `./.commands/check.sh 07` passe (transpilation, compilation et sortie identique à TypeScript).

---

## Projet 08

**Source** : `inputs: [number, number, number][]`, `DArray.map(inputs, ([one, two, divisor]) => ...)`, puis un `map` curryfié dans un `pipe`.

**Problèmes posés** : collection de calculs ; tableau de tuples ; déstructuration dans un paramètre.

**Réponse** (D-18.5) :
- le tuple devient **`[]float64`** (une slice, comme un tableau JS ; plus `[3]float64`) ;
- le tableau devient `[][]float64` ;
- la déstructuration devient un paramètre `p []float64` suivi de `one, two, divisor := p[0], p[1], p[2]` au début du corps (étape 6) ;
- les deux `map` (avec données, puis curryfié dans un `pipe` avec `whenIsRightOtherwise(DString.to, …)` comme callback) passent par le helper `Map`, et sont aussi vérifiés contre l'affichage de Node dans `tests/maps-advanced/`.

**Go obtenu** (`projects/08/dist/index.ts/index.ts.go`, étape 9) :

<details>
<summary>Afficher le Go généré</summary>

Les noms de package sont abrégés ici (`add_ts`) : le transpileur les écrit encore avec le chemin absolu du fichier (bug B-02, étape 11).

```go
import "duplojs.local/transpiled/add.ts"
import "duplojs.local/transpiled/divide.ts"
import "duplojs.local/transpiled/shard_dependencies"

var Sourced_inputs [][]float64

var Sourced_calculations []shard_dependencies.EitherAny

var Sourced_display []string

func init() {
	Generated_1 := ([]float64{
		(float64)(1),
		(float64)(2),
		(float64)(1),
	})
	Generated_2 := ([]float64{
		(float64)(4),
		(float64)(5),
		(float64)(3),
	})
	Generated_3 := ([]float64{
		(float64)(2),
		(float64)(3),
		(float64)(0),
	})
	Sourced_inputs = ([][]float64{
		Generated_1,
		Generated_2,
		Generated_3,
	})
	Generated_5 := func(Generated_4 []float64) (shard_dependencies.EitherAny) {
		Sourced_one := Generated_4[0]
		Sourced_two := Generated_4[1]
		Sourced_divisor := Generated_4[2]
		return shard_dependencies.RightThen(add_ts.Sourced_add(Sourced_one, Sourced_two), func(Sourced_value float64) (shard_dependencies.EitherAny) {
			return divide_ts.Sourced_divide(Sourced_value, Sourced_divisor)
		})
	}
	Sourced_calculations = shard_dependencies.Map(Sourced_inputs, func(Generated_6 []float64, _ struct {
		Sourced_index float64 "json:\"index\""
		Sourced_self [][]float64 "json:\"self\""
	}) (shard_dependencies.EitherAny) {
		return Generated_5(Generated_6)
	})
	Generated_7 := Sourced_calculations
	Generated_10 := func() (string) {
		return "échec"
	}
	Generated_11 := func(Generated_9 shard_dependencies.EitherAny) (string) {
		return shard_dependencies.WhenIsRightOtherwise(Generated_9, shard_dependencies.JSNumberToString, func(_ shard_dependencies.EitherAny) (string) {
			return Generated_10()
		})
	}
	Generated_13 := func(Generated_8 []shard_dependencies.EitherAny) ([]string) {
		return shard_dependencies.Map(Generated_8, func(Generated_12 shard_dependencies.EitherAny, _ struct {
			Sourced_index float64 "json:\"index\""
			Sourced_self []shard_dependencies.EitherAny "json:\"self\""
		}) (string) {
			return Generated_11(Generated_12)
		})
	}
	Generated_14 := Generated_13(Generated_7)
	Sourced_display = Generated_14
	Generated_15 := shard_dependencies.Print[any]
	Generated_15(Sourced_display)
}
```

</details>

**État** : ✅ `./.commands/check.sh 08` passe (transpilation, compilation et sortie identique à TypeScript).

---

## Projet 09

**Source** : `DEither.group(calculations)`, puis `whenIsRightOtherwise`.

**Problème posé** : regrouper des résultats et échouer dès qu'un seul échoue.

**Réponse** : le helper `Group[T](rs []EitherAny)` boucle sur les résultats, s'arrête au **premier** échec et le renvoie ; sinon, il renvoie un `success` de la slice des valeurs (comme DuploJS, vérifié dans sa source).
- **Type de retour** : `Success<number[]> | Left<…, number>`. Depuis D-18, c'est simplement un **`EitherAny`** (`Either2` n'existe plus) : la valeur est un `[]float64` pour le succès, un `float64` pour la gauche, et chaque lecteur l'ouvre avec le type que TypeScript connaît.
- `calculations` est un `[]EitherAny` (`DArray.map` qui produit des Either : vérifié dans `tests/maps-advanced/`).
- DuploJS accepte aussi un **objet** de résultats, avec des **fonctions** appelées à la demande : traduit depuis D-19 (`group({ a, b: () => f() })`). Le tableau de fonctions n'est pas encore traduit.

**Go obtenu** (`projects/09/dist/index.ts/index.ts.go`, étape 9) :

<details>
<summary>Afficher le Go généré</summary>

Les noms de package sont abrégés ici (`add_ts`) : le transpileur les écrit encore avec le chemin absolu du fichier (bug B-02, étape 11).

```go
import "duplojs.local/transpiled/add.ts"
import "duplojs.local/transpiled/divide.ts"
import "duplojs.local/transpiled/shard_dependencies"

var Sourced_inputs [][]float64

var Sourced_calculations []shard_dependencies.EitherAny

var Sourced_transaction shard_dependencies.EitherAny

var Sourced_display []string

func init() {
	Generated_1 := ([]float64{
		(float64)(1),
		(float64)(2),
		(float64)(1),
	})
	Generated_2 := ([]float64{
		(float64)(4),
		(float64)(5),
		(float64)(3),
	})
	Generated_3 := ([]float64{
		(float64)(2),
		(float64)(3),
		(float64)(0),
	})
	Sourced_inputs = ([][]float64{
		Generated_1,
		Generated_2,
		Generated_3,
	})
	Generated_5 := func(Generated_4 []float64) (shard_dependencies.EitherAny) {
		Sourced_one := Generated_4[0]
		Sourced_two := Generated_4[1]
		Sourced_divisor := Generated_4[2]
		return shard_dependencies.RightThen(add_ts.Sourced_add(Sourced_one, Sourced_two), func(Sourced_value float64) (shard_dependencies.EitherAny) {
			return divide_ts.Sourced_divide(Sourced_value, Sourced_divisor)
		})
	}
	Sourced_calculations = shard_dependencies.Map(Sourced_inputs, func(Generated_6 []float64, _ struct {
		Sourced_index float64 "json:\"index\""
		Sourced_self [][]float64 "json:\"self\""
	}) (shard_dependencies.EitherAny) {
		return Generated_5(Generated_6)
	})
	Sourced_transaction = shard_dependencies.Group[float64](Sourced_calculations)
	Generated_9 := func() ([]string) {
		return ([]string{
			"transaction annulée",
		})
	}
	Sourced_display = shard_dependencies.WhenIsRightOtherwise(Sourced_transaction, func(Sourced_values []float64) ([]string) {
		Generated_7 := shard_dependencies.JSNumberToString
		return shard_dependencies.Map(Sourced_values, func(Generated_8 float64, _ struct {
			Sourced_index float64 "json:\"index\""
			Sourced_self []float64 "json:\"self\""
		}) (string) {
			return Generated_7(Generated_8)
		})
	}, func(_ shard_dependencies.EitherAny) ([]string) {
		return Generated_9()
	})
	Generated_10 := shard_dependencies.Print[any]
	Generated_10(Sourced_display)
}
```

</details>

**État** : ✅ `./.commands/check.sh 09` passe (transpilation, compilation et sortie identique à TypeScript).

---

## Projet 10

**Source** : `async function calculate`, `rightAsyncPipe`, `asyncGroup([() => ...])`, `asyncPipe`, `await`.

**Problèmes posés** : composer des résultats asynchrones ; représenter `Promise` / `await` en Go.

**Réponse** :
- exécution synchrone (D-11) : `async` et `await` disparaissent, et `Promise<T>` devient `T` ;
- `rightAsyncPipe` devient une chaîne de `RightThen` comme `rightPipe` ;
- `asyncGroup` exécute les thunks dans l'ordre et s'arrête au premier `Left`, comme l'implémentation DuploJS ;
- `asyncPipe` est déroulé en appels successifs comme `pipe`.

**Go obtenu**, sous forme simplifiée :
```go
func Sourced_calculate(one, two, divisor float64) shard_dependencies.EitherAny {
	return shard_dependencies.RightThen(
		shard_dependencies.RightThen(add(one, two), func(value float64) shard_dependencies.EitherAny {
			return divide(value, divisor)
		}),
		func(value float64) shard_dependencies.EitherAny {
			return shard_dependencies.EitherAny{Tag: shard_dependencies.TagRightSuccess, Value: value * 2}
		},
	)
}

calculations = shard_dependencies.AsyncGroup[func() EitherAny, float64](
    getters,
    func(getter func() EitherAny) EitherAny { return getter() },
    shard_dependencies.TagRightSuccess,
)
```

**État** : ✅ `./.commands/check.sh 10` passe, avec une sortie identique :
`[ 'transaction annulée' ]`.
