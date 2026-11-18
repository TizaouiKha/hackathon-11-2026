# Journal des décisions — Hackathon DuploJS TS → Go

On note ici chaque choix d'architecture ou d'organisation, avec sa raison.
Statuts : ✅ adopté · 🟡 proposé (à valider en équipe) · ❌ écarté.

---

## Environnement

### D-01 · Lancer le build sous WSL, pas sous Windows natif — ✅ (17/11/2026)
- **Constat** : sous Windows, `pnpm build:00` échoue avec `missingProject`. `@duplojs/lang/path` produit des chemins `/C:/Users/...`, TypeScript attend `C:/Users/...`. Le défaut touche plusieurs endroits (`createAbsolute(sourceFile.path)`, etc.).
- **Choix** : on travaille sous WSL Ubuntu, directement sur le dossier Windows (`/mnt/c/Users/khaln/Desktop/ESGI-TP/hackathon-11-2026`). Édition depuis Windows, exécution depuis WSL.
- **Outils WSL** : Node 24.13.1, Go 1.27.4, pnpm 12.18.0, dans `~/.local/opt` (PATH ajouté à `~/.bashrc`).
- **Attention** : les `node_modules` du repo sont ceux de Linux. Ne pas lancer `pnpm install` depuis Windows.
- **Commandes** (depuis Ubuntu) :
  ```bash
  cd /mnt/c/Users/khaln/Desktop/ESGI-TP/hackathon-11-2026
  pnpm build:00
  cd projects/00/dist && go build -o /tmp/p00 . && /tmp/p00
  ```

### D-02 · Dépôt — ✅
- Fork : https://github.com/TizaouiKha/hackathon-11-2026 (`origin`), amont : `duplojs/hackathon-11-2026` (`upstream`).

---

## Architecture du transpileur

### D-03 · Ne pas réécrire les factories de l'AST Go — ✅
- `GoAST.create*` couvre déjà quasiment tout Go (environ 1 900 lignes), et le printer (environ 1 100 lignes) le rend.
- L'effort va dans les **transformers** TypeScript → Go, pas dans de nouvelles factories de nœuds.

### D-04 · Respecter les conventions du skill `typescript-to-go` — ✅
- Un transformer par opération, déclaré avec un contrat explicite `Transformer<GoAST.X>`.
- Pas de « transformer universel » ni de dossier `transformers/helpers/`.
- Domaine DuploJS : un **routeur** (résolution par symbole via `resolveReferenceModule`) puis un **handler** par fonction. Ne jamais reconnaître une API à son seul nom textuel.
- Listes de transformers en `DCommon.memo`, lues via `.value`.

### D-05 · Faire d'abord l'inventaire des transformers — 🟡
- La liste complète tirée des 11 exercices est dans [EXERCICES.md](EXERCICES.md#inventaire-des-transformers).
- Elle sert à se répartir le travail.

### D-06 · Helper de « préparation » dans `BuildContext` — 🟡
- **Problème** : le motif « transformer l'enfant, vérifier l'erreur, créer une variable temporaire, concaténer `before` » est copié-collé (`binary.ts`, `call.ts`) et va revenir partout.
- **Proposition** : `context.transformPrepared(node, list)`, qui renvoie `{ before, operand }`.
- **Optimisation** : ne pas créer de variable temporaire pour un identifiant ou un littéral (aujourd'hui `1 + 2` en génère 4). Le Go reste juste, devient lisible, et la sortie est plus « pertinente » au sens du cours.
- Placé dans le contexte plutôt que dans `helpers/` pour rester dans l'esprit de D-04.

### D-07 · Constantes du module partagées entre fichiers — 🟡
- Aujourd'hui, une instruction au niveau du module part dans `init()`, et `const x = ...` y devient une variable locale.
- Si `x` est lu ailleurs (dans une fonction, un autre fichier), il faut une `var x T` au niveau du package, affectée dans `init()`. Ce sera un transformer dédié.

---

## Représentation des données

### D-08 · `number` → `float64` — ✅ (déjà dans le code de départ)
- Même représentation IEEE 754 double que JS.
- Spécialisation en `int` seulement si une garantie le permet (voir le cours « Stratégies », slide 14). Pas prévu pour l'instant.

### D-09 · Représentation des `Either` — ✅ décidé en équipe (17/11/2026)

Trois questions ont été tranchées. Le comparatif complet des points forts et faibles est en bas de cette section.

#### D-09.1 · Identifier la variante : **tag entier** (option C) — ✅
```go
type EitherTag uint8

const (                         // générées par le transpileur :
	TagSuccess EitherTag = iota  // une constante par information
	TagFail                      // rencontrée dans le programme
	TagNegativeOperand
	TagDivisionByZero
)
```
- **Pourquoi** : c'est l'option la plus performante, ce que l'équipe cherche. La comparaison d'entier tient en une instruction, le tag ne pèse qu'un octet, et une faute de nom est détectée à la compilation.
- Le **côté** (droite/gauche) et le **texte** de l'information ne sont pas stockés dans la valeur. On les retrouve à partir du tag avec deux tables générées : `isRightTag[tag]` et `informationName[tag]`.
- Pour faciliter le débogage, `EitherTag` a une méthode `String()` qui affiche le nom.
- **Écarté** :
  - l'interface avec une struct par variante : allocations sur le tas et type switch dynamique ;
  - l'information en chaîne (code de départ) : comparaisons de chaînes, 16 octets au lieu d'un.

#### D-09.2 · Type de la valeur : **`Either[T]` par défaut, `Either2[R, L]` quand l'union l'exige** — ✅
```go
type Either[T any]     struct { Tag EitherTag; Value T }              // même type à droite et à gauche
type Either2[R, L any] struct { Tag EitherTag; Right R; Left L }      // types différents
```
(Go ne permet pas deux types du même nom avec un nombre de paramètres différent, d'où `Either2`.)

**Règle de choix**, appliquée par le transpileur avec le checker sur chaque union d'`Either` :
1. On lit le type de valeur de chaque variante (`Success<X>`, `Left<"info", X>`, `Fail`).
2. `Fail` (valeur `undefined`) est **compatible avec tout** : la valeur reste à zéro, et c'est le tag qui dit à `print` d'afficher `undefined`.
3. Toutes les valeurs ont le même type → **`Either[T]`**.
4. Toutes les droites ont un type R et toutes les gauches un type L, avec R ≠ L → **`Either2[R, L]`**.
5. Sinon (deux gauches de types différents, par exemple) → erreur explicite du transformer `unsupported-either-mixed-value-types`. Aucun exercice n'a ce cas.

**Où on en a besoin** (vérifié dans les types de DuploJS) :
- projets 01 à 08 : `Either[float64]` (ou `Either[[]float64]` après `coalescing`) ;
- projets **09 et 10** : `DEither.group` / `asyncGroup` renvoient `Success<number[]> | Left<…, number>`. Le succès est un tableau et l'erreur un nombre, donc **`Either2[[]float64, float64]`**.

#### D-09.3 · Helpers : **fonctions génériques Go d'abord**, puis déroulé là où les mesures le justifient — ✅
```go
func IsRight[T any](r Either[T]) bool
func WhenIsRight[T, U any](r Either[T], f func(T) U) Either[U]
func WhenIsRightOtherwise[T, U any](r Either[T], f func(T) U, g func() U) U
func RightPipe…, Group…, MatchInformation…
```
- **Pourquoi** :
  - l'équipe découvre Go : chaque helper est écrit **une fois**, en Go normal, et testé à part ;
  - le Go généré reste proche du TypeScript, donc facile à déboguer ;
  - c'est la démarche du cours : « compiler correctement, puis spécialiser les cas coûteux et mesurer ».
- **Coût accepté** : un appel de fonction et une closure possible. Le compilateur Go supprime souvent l'appel des petites fonctions de lui-même (inlining).
- **Plus tard (étape 11)** : `go build -gcflags=-m` et `go test -bench`. On ne déroule à la compilation que ce que les mesures désignent, probablement `IsRight`.
- Les helpers sont des **shared dependencies**, une par opération (voir le skill `typescript-to-go`).

#### D-09.4 · Mise en œuvre (étape 3) — ✅ (17/11/2026, branche `etape-3-either`)
- **Constructeurs = littéraux de struct**, pas des fonctions :
  - `DEither.success(x)` devient `shard_dependencies.Either[float64]{Tag: shard_dependencies.TagRightSuccess, Value: x}` ;
  - `fail()` ne met pas de `Value` (valeur à zéro, et le tag indique `undefined`).

  Pas d'appel, pas d'instanciation générique, aucun coût à l'exécution. Ça remplace `EitherSuccess[T]` / `EitherSuccessOf` du code de départ (et la correction B-01).
- **Type cible d'un constructeur** : `return DEither.fail()` doit avoir le type de toute la fonction (`Either[float64]`), pas `Fail` seul. On prend, dans l'ordre :
  1. le type de retour de la fonction englobante, si l'appel est en position de `return` ;
  2. le type contextuel du checker ;
  3. le type propre de l'appel.
- **Tags** :
  - une constante par couple (côté, information), créée au premier usage et numérotée dans l'ordre d'apparition ;
  - nommée en PascalCase : `TagRightSuccess`, `TagLeftNegativeOperand` ;
  - chaque tag remplit les tables dans le `init()` de `shard_dependencies`. Les tables sont des tableaux fixes `[256]`, donc pas d'allocation, et un `uint8` ne peut pas sortir des bornes.
- **Registre des tags** : il est rattaché au `TranspilationContext` par une `WeakMap`, dans `either/core/tag.ts`. On n'ajoute donc pas de champ propre au domaine Either dans le contexte global.
- **Littéraux élargis** : `Left<"x", 0>` (génériques `const` de DuploJS) devient une valeur `float64`.
- **Limite connue** : un constructeur utilisé comme valeur (`map(xs, DEither.success)`) renvoie une erreur `either-constructor-used-as-value-not-supported`. Aucun exercice n'a ce cas.

#### Comparatif qui a servi à décider

| Question | Option | ✅ Points forts | ❌ Points faibles |
|---|---|---|---|
| 1 | A. Interface + une struct par variante | idiomatique, lisible | allocations sur le tas, test dynamique, beaucoup de types à générer |
| 1 | B. Information en chaîne | déjà commencé, lisible en débogage | comparaisons de chaînes, 16 octets, fautes vues seulement à l'exécution |
| 1 | **C. Tag entier** | **le plus rapide et compact, erreurs vues à la compilation** | constantes à générer, `String()` pour déboguer |
| 2 | **`Either[T]`** | **compact, couvre 01 à 08** | ne gère pas des types différents |
| 2 | **`Either2[R, L]`** | **couvre 09 et 10** | struct plus lourde, signatures plus longues |
| 3 | **Fonctions génériques** | **simples à écrire et à tester, Go lisible** | appel et closure possibles (souvent supprimés par Go) |
| 3 | Déroulé à la compilation | le plus rapide | dur à générer, à déboguer, et duplique le code |

#### D-09.5 · Mise en œuvre des helpers (étape 7) — ✅ (18/11/2026, branche `etape-7-either-helpers`)
- **`isRight(r)` devient `r.Tag.IsRight()`**. Pas de helper `IsRight` (contrairement à ce que prévoyait D-09.3) : la méthode du tag fait déjà le travail, sans appel supplémentaire, et marche pour `Either` comme pour `Either2`.
- **Helpers génériques écrits une fois**, en shared dependency, un dossier par fonction :

  | Helper | Rôle |
  |---|---|
  | `WhenIsRightOtherwise[T, U]` et `WhenIsRightOtherwise2[R, L, U]` | appliquer un callback selon le côté |
  | `MatchInformation[T, U](input, handlers []func(T) U)` | handlers rangés **par numéro de tag** dans un slice (accès direct, pas de map) |
  | `RightThen[T](input, next)` | `rightPipe(r, f, g)` devient `RightThen(RightThen(r, f), g)` |
- **Adaptation des callbacks** : TypeScript accepte un callback qui ignore ses paramètres (`() => -1`), Go exige la signature exacte. Le transpileur enveloppe alors le callback : `func(_ float64) float64 { return f() }`. Le callback est évalué une seule fois, avant.
- **Limites explicites** (erreurs claires, aucun exercice concerné) :
  - `matchInformation` et `rightPipe` sur un `Either2` ;
  - une étape de `rightPipe` qui change de type d'Either ou renvoie une valeur brute ;
  - un callback dont le paramètre est plus précis que ce qu'il reçoit.

### D-16 · Résultat de `whenIsRight` : « valeur brute | erreur » — ✅ validé (18/11/2026) et implémenté (branche `etape-7-either-helpers`)
**Le problème.** `DEither.whenIsRight(r, f)` ne renvoie **pas** un `Either` :
- si `r` est un succès, il renvoie **directement** `f(valeur)`, une valeur brute ;
- sinon, il renvoie `r` tel quel (l'erreur).

Exemple dans les projets 02 à 04 : `whenIsRight(result, coalescing)` a le type `number[] | Fail`. Il affiche `[ 3 ]` (le tableau brut) si c'est un succès, et l'objet `Fail` sinon. D-09 ne prévoit pas ce mélange « valeur brute ou Either ».

**Proposition : un tag réservé `TagValue`**, qui veut dire « ce n'est pas un Either, c'est une valeur brute ».
```go
// number[] | Fail  ->  Either[[]float64]
Either[[]float64]{Tag: TagValue, Value: []float64{3}}   // succès : la valeur brute
Either[[]float64]{Tag: TagLeftFail}                     // erreur : inchangée
```
- On réutilise toute la mécanique existante : la règle `Either` / `Either2` de D-09.2, le tag entier et les tables. Aucun nouveau type.
- `TagValue.IsRight()` vaut `false`, ce qui est cohérent avec DuploJS : `isRight([3])` est faux.
- **`print` (étape 4)** devra afficher seulement `Value` quand le tag est `TagValue` (`[ 3 ]`), et l'objet DuploJS sinon.
- Le helper `WhenIsRight` construit le résultat avec une petite fonction de conversion générée par le transpileur, comme pour l'adaptation des callbacks.

**Alternative écartée** : un nouveau type `ValueOrEither[V, T]`. C'est plus explicite, mais il faut doubler tous les helpers et tout l'affichage.

**Décision** : `TagValue` est validé en équipe.

**Mise en œuvre** :
- **Le tag réservé `TagValue`** est créé au premier usage, comme les autres tags. `TagValue.IsRight()` vaut `false`, et `TagValue.Information()` vaut `"value"`.
- **Les unions mixtes sont reconnues** (`either/core/type.ts`, `resolveUnionVariants`) : dans une union qui contient **au moins un** type Either, chaque membre qui n'est pas un Either (`number`, `boolean`, `number[]`…) devient une variante « valeur brute ». La valeur brute est rangée **du côté droit** pour la règle `Either` / `Either2` de D-09.2. Exemples :
  - `number | Left<"x", number>` donne `Either[float64]` ;
  - `boolean | Left<"x", number>` donne `Either2[bool, float64]` ;
  - `boolean | Fail` donne `Either[bool]`.

  Une union **sans** type Either (`number | undefined`) n'est pas concernée.
- **Le helper `WhenIsRight[T, V, O]`** reçoit deux petites fonctions générées par le transpileur :
  ```go
  shard_dependencies.WhenIsRight(result, double,
      func(v float64) Either[float64] { return Either[float64]{Tag: TagValue, Value: v} },        // succès -> valeur brute
      func(l Either[float64]) Either[float64] { return Either[float64]{Tag: l.Tag, Value: l.Value} }, // erreur recopiée
  )
  ```
  Si l'erreur ne porte pas de valeur (`Fail` seul), elle est recopiée sans `Value`.
- **Limites explicites** :
  - entrée `Either2` ;
  - callback qui renvoie lui-même un Either ;
  - erreur dont la valeur n'a pas le même type que dans le résultat.

  Aucun exercice n'est concerné.
- **Pour `print` (étape 4)** : quand `Tag == TagValue`, afficher **seulement** la valeur (`Value`, ou `Right` pour un `Either2`), comme une valeur brute (`[ 3 ]`). Sinon, afficher l'objet DuploJS.
- **Testé** : `tests/either-helpers/`, 14 contrôles dédiés (succès, left, fail, `Either2`, `Fail` seul, `isRight` d'une valeur brute).

### D-10 · `pipe` / formes curryfiées — ✅ (adapté à D-09.3)
- `DCommon.pipe(x, f, g)` est **déroulé à la compilation** en `t1 := f(x)`, puis `t2 := g(t1)`. Ce n'est pas une optimisation : Go n'a pas de génériques variadiques, donc un `Pipe` générique est impossible sans écrire `Pipe2`, `Pipe3`… Le déroulé est ici le plus simple.
- ~~Les formes curryfiées ne sont traduites que dans un `pipe` ou un `map`.~~ **Remplacé par D-17** : une forme curryfiée devient une vraie fonction Go, utilisable partout.
- **Implémenté (18/11/2026, branche `etape-8a-pipe`)** dans `duplojs/common/pipe/` :
  ```go
  Generated_8 := Sourced_value                // l'entrée
  Generated_9 := Sourced_double(Generated_8)  // étape 1
  Generated_10 := Sourced_addTen(Generated_9) // étape 2 -> résultat
  ```
  Ordre d'évaluation identique à TypeScript : l'entrée, puis **toutes les étapes** (les fonctions elles-mêmes), puis les appels. Une étape qui n'est pas un simple nom de fonction est d'abord rangée dans une variable.

### D-17 · Formes curryfiées des helpers Either = fonctions Go — ✅ (18/11/2026, branche `etape-8a-pipe`)
**Le problème.** Dans `DCommon.pipe(result, DEither.whenIsRight(double))`, `DEither.whenIsRight(double)` n'a **pas** de donnée : c'est une **fonction** qui attend l'Either. Le projet 08 en passe même une à `DArray.map`.

**Choix.** La forme curryfiée devient une **fonction Go littérale**, qui appelle le même helper que la forme avec données :
```go
func(input shard_dependencies.Either[float64]) shard_dependencies.Either[float64] {
    return shard_dependencies.WhenIsRight(input, Sourced_double, …)
}
```
- **Le type du paramètre et du résultat** vient de la signature **instanciée par le checker**. Dans un `pipe`, TypeScript connaît l'entrée, par exemple `(input: Fail | Success<number>) => number | Fail`.
- **Aucun code dupliqué** : chaque helper (`whenIsRight`, `whenIsRightOtherwise`, `matchInformation`) est écrit comme une « opération » qui reçoit son entrée (`either/core/operand.ts`). La forme avec données lui passe l'argument TS, la forme curryfiée lui passe le paramètre de la fonction générée.
- **Évaluation** : les callbacks sont évalués **une fois**, à la création de la fonction curryfiée, comme en TypeScript. Leurs préparations restent hors de la fonction Go.
- **Pourquoi pas « injecter » la donnée dans le `pipe` ?** C'est plus court en Go, mais ça ne marche que dans un `pipe`. Une vraie fonction marche aussi dans `DArray.map` (projet 08) et partout ailleurs.
- **Vérifié** : `tests/pipe/`, 15 contrôles. Les valeurs attendues ont été obtenues en exécutant le même code TypeScript avec DuploJS. Ce test confirme notamment que la valeur brute (`TagValue`) produite par `whenIsRight` n'est **pas** un Right pour l'étape suivante, comme en DuploJS.

### D-11 · Asynchrone (projet 10) — 🟡
- Il n'y a aucune vraie entrée/sortie, donc une **exécution synchrone** (`Promise<T>` traduit en `T`) préserve l'ordre et le résultat.
- Goroutines et channels seulement en bonus, si on a le temps.

### D-12 · Rendu des nombres en chaîne — ✅ (18/11/2026, branche `etape-8b-dstring-to`)
- `DString.to(3)` doit donner `"3"` comme en JS, pas `"3.000000"`.
- ~~`strconv.FormatFloat(f, 'f', -1, 64)` couvre les cas courants.~~ Ce n'est **pas suffisant** : JavaScript passe en notation exponentielle à partir de `1e21` et en dessous de `1e-6` (`1e+21`, `1e-7`), et écrit `NaN`, `Infinity` et `0` pour `-0`.
- **Choix** : la shared dependency `JSNumberToString(float64) string` (`duplojs/string/to/sharedDependency.ts`) suit **pas à pas l'algorithme de la spécification ECMAScript** (« Number::toString »). Elle part des chiffres les plus courts que donne `strconv.FormatFloat(value, 'e', -1, 64)`, la même règle que JavaScript, puis place la virgule ou l'exposant selon les mêmes seuils.
- **Vérifié** (`tests/js-number-to-string/`) : **2 034 nombres** comparés à `String(x)` de Node, sans écart. Ce sont 34 cas limites (`0.30000000000000004`, `1e+21`, `1e-7`, `5e-324`, `-0`, `NaN`, `±Infinity`, `2**53`…) et 2 000 `float64` aléatoires tirés sur tous les bits, avec une graine fixe.
- **`DString.to`** (`duplojs/string/`) :
  - appelée : `DString.to(n)` devient `shard_dependencies.JSNumberToString(n)` ;
  - passée comme fonction (`DArray.map(DString.to)`, `success: DString.to`) : elle devient `shard_dependencies.JSNumberToString`, de type `func(float64) string`.

  Seuls les nombres sont traduits (le seul usage des exercices) ; les autres types renvoient une erreur claire.
- **Pour `print` (étape 4)** : réutiliser `JSNumberToString` pour afficher les nombres, puisque `util.inspect` les écrit comme `String(x)`.

### D-13 · `print` = format `util.inspect` de Node, pas du JSON — ✅ (constat, 17/11/2026)
- `DCommon.print(x)` appelle `console.info(x)` (source : `@duplojs/lang/dist/common/print.mjs`). Node formate donc avec `util.inspect`.
- Conséquences pour la sortie Go :
  - guillemets **simples** dans les objets et tableaux ;
  - une chaîne affichée seule est écrite sans guillemets ;
  - `undefined` est affiché ;
  - un objet passe sur plusieurs lignes au-delà de 80 caractères ;
  - les tableaux s'écrivent `[ 3 ]`.
- `json.Marshal` **ne suffit pas**. Il faut un `Inspect` en Go (par réflexion, avec les noms de clés pris dans les tags de struct). C'est l'étape 4 de [ETAPES.md](ETAPES.md).
- Les sorties de référence de chaque projet sont dans [EXERCICES.md](EXERCICES.md).

### D-14 · Validation par comparaison automatique avec TypeScript — ✅
- `./.commands/check.sh NN` (ou `pnpm check NN`) transpile, compile, exécute le Go et le TS, puis fait un `diff` des sorties.
- Une étape ou un exercice est validé seulement si ce script affiche ✓.
- **Complément (18/11/2026)** : les **tests d'exécution** `tests/<nom>/` (`pnpm test:runtime`). Ils servent à valider une brique seule, avant que les projets complets puissent tourner : un petit TS à transpiler, plus un `check/main.go` écrit à la main qui vérifie les valeurs Go. Le premier est `tests/either/` (étape 3, 21 contrôles). Leur `dist/` est ignoré par git, et ils sont inclus dans le lint (`oxlint.config.ts`).

### D-15 · Organisation du travail — ✅
- Les étapes, leurs dépendances et la répartition sont dans [ETAPES.md](ETAPES.md). Chacun s'inscrit sur une étape avant de la commencer.

---

## Bugs connus du code de départ

### B-01 · `EitherSuccessOf` utilisé sans instanciation — ✅ corrigé, puis rendu caduc par D-09.4 (`EitherSuccessOf` n'existe plus)
- `go build` du projet 00 : `cannot use generic function shard_dependencies.EitherSuccessOf without instantiation`.
- Le Go généré contenait `Generated_4 := shard_dependencies.EitherSuccessOf` alors qu'il faut `EitherSuccessOf[float64]`, comme dans le README du projet 00.
- **Correction** (`duplojs/either/success/index.ts`) :
  - on lit le type de l'**appel** avec le checker : `getTypeAtLocation(call)`, puis `typeToTypeNode`, ce qui donne `Success<number>` ;
  - on le passe à `successTypeHandler` pour obtenir `EitherSuccess[float64]` ;
  - on reprend ses `typeArguments` dans un `GoAST.createInstantiationExpression`.
- **Limite connue** : `success` utilisée comme valeur, hors d'un appel (`f(DEither.success)`), renvoie une erreur `success-reference-outside-call`. Ce n'est pas utilisé dans les exercices.
- **À surveiller** : `success<const T>` donne `Success<1>` pour `success(1)`. Il faudra élargir les types littéraux (étape 3 de [ETAPES.md](ETAPES.md)).

### B-02 · Noms de package illisibles — mineur
- Le nom du package est tiré du chemin absolu : `Sourced_001bmnt001bc001bUsers...`. C'est valide mais illisible, et la valeur change selon la machine.
- Piste : utiliser le chemin relatif au `projectWorkDirectory`.
