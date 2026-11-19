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

### D-06 · Helper de « préparation » dans `BuildContext` — ✅
- **Problème** : le motif « transformer l'enfant, vérifier l'erreur, créer une variable temporaire, concaténer `before` » est copié-collé (`binary.ts`, `call.ts`) et va revenir partout.
- **Implémentation** — `context.transformPrepared(node, list)` transmet les erreurs de transformation. En cas de succès, il renvoie `{ before, operand }`, où `before` contient les instructions à exécuter avant d'utiliser `operand`.
- Les identifiants et les littéraux, dont les nombres écrits `float64(...)`, sont utilisés directement. Un temporaire permet de calculer une expression plus complexe une seule fois, au bon moment. Pour certaines opérations avec un littéral numérique, il impose aussi un calcul à l'exécution, par exemple pour diviser par zéro.
- Dans un appel, on prépare la fonction, puis les arguments de gauche à droite. Pour `&&` et `||`, les instructions de droite sont exécutées uniquement quand l'opérateur a besoin de cette valeur.
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

### D-18 · `EitherAny` et couche de traduction TypeScript → Go — ✅ validé avec le prof (18/11/2026), en cours (branche `d18-traduction-types`)

**Le problème.** DuploJS raisonne par **issue** : une information et sa valeur, en nombre illimité, chacune de son propre type. C'est le sens de l'article « Une erreur devrait être identifiable avant d'être traitée ». Notre représentation (D-09.2 : `Either[T]` / `Either2[R, L]`) découpe par **côté**, ne gère que 2 types de valeur, et rejette des unions réelles comme celle du code du prof : `Left<"must-be-not-contain-number", undefined> | Error<null> | Success<number & Positive>`.

Plus largement, TypeScript et Go **n'expriment pas les types de la même manière** :
- unions, types littéraux, marques (`number & Positive`) ;
- typage structurel contre typage nominal ;
- narrowing selon l'endroit, types calculés (`Extract`, `ReturnType`).

Les valeurs ne se comportent pas pareil non plus : `"é".length` vaut 1 en JS (UTF-16) mais `len("é")` vaut 2 en Go (UTF-8).

**Décision, en deux parties.**

**1. Une seule représentation pour toutes les unions d'`Either` :**
```go
type EitherAny struct {
    Tag   EitherTag // l'issue : information + côté (tags inchangés, TagValue compris)
    Value any       // la valeur, de n'importe quel type ; JSUndefined{} / JSNull{} pour undefined / null
}
```
- N issues, de n'importe quel type, sans règle `Either` / `Either2` et sans conversion entre formes d'union.
- **Côté Go, on ne vérifie pas le type de la valeur** : TypeScript l'a déjà validé.
- **Lire la valeur** : un `any` est une boîte fermée, et Go refuse `v + 1` ou `v.Name`. À chaque endroit où le code lit la valeur, le checker connaît son type exact. Le transpileur génère donc :
  - **une assertion** `e.Value.(float64)` si TS indique un seul type (~1 ns mesurée) ;
  - **un type switch** si TS indique une union de valeurs brutes ;
  - **rien** si la valeur est seulement transmise ;
  - **la réflexion** pour `print`.
- **Mesuré** (`go test -bench`) : assertion ~1 ns. Ranger un `float64` dans `any` coûte une allocation (6,3 ns contre 2,4 ns sans). Une case `Num float64` à part est une **optimisation possible plus tard** (étape 11), pas maintenant.

**2. Une couche de traduction centrale : `tsTypeToGo(type)`.** Un **seul** endroit traduit un type du checker (objet `Type`, et non plus un nœud de type) en type Go :

| TypeScript | Go |
|---|---|
| `number`, littéral numérique, `number & Marque` | `float64` |
| `string`, littéral, template literal, `string & Marque` | `string` |
| `boolean`, `true`, `false` | `bool` |
| `null` / `undefined`, `void` | `shard_dependencies.JSNull` / `JSUndefined` |
| union contenant un type `Either` de DuploJS | `shard_dependencies.EitherAny` |
| `T[]`, `readonly T[]` | `[]T` |
| tuple `[A, B, C]` | `[3]T` si tous les éléments ont le même type Go, sinon `struct{ V0 A; V1 B; V2 C }` |
| objet `{ name: string }` | struct **anonyme** `struct{ Name string }` : Go traite deux structs anonymes de même forme comme le même type, ce qui correspond au typage structurel de TS |
| fonction `(a: A) => R` | `func(A) R` |
| `Promise<T>` | `T` (D-11, exécution synchrone) |
| union de valeurs brutes (`string \| number`), `unknown`, `any`, `T` générique non résolu | `any` |

Les types calculés (`Extract`, `ReturnType`…) n'ont pas besoin de règle : le checker donne leur **résultat** à chaque endroit.

**Pourquoi.**
- Un seul point de vérité au lieu de traductions éparpillées dans chaque transformer. C'est la cause des limites rencontrées : `number[]` non géré, unions refusées, marques non retirées.
- Ça débloque d'un coup `EitherAny`, le narrowing, les tableaux (étape 6) et l'exemple du prof.

**Plan.**
1. **Phase 1, décidée en équipe : uniquement `EitherAny` et les types primitifs.**
   - `tsTypeToGo` traduit `number`, `string`, `boolean`, `null`, `undefined` / `void`, leurs littéraux, les marques et les unions d'`Either`.
   - Tout le reste (tableaux, tuples, objets, fonctions, `Promise`) renvoie pour l'instant une **erreur claire** `type-not-supported-yet`.
   - On passe à `EitherAny` (constructeurs, helpers, `print`).
2. Lecture typée aux endroits de lecture, narrowing compris.
3. Tableaux, tuples, objets, fonctions, `Promise` (le reste du tableau ci-dessus).
4. Sémantique des valeurs (`JSStringLength` en UTF-16…).

**Remplace** D-09.2 (règle `Either` / `Either2`) et la partie « par côté » de D-09.4. Le tag entier (D-09.1), `TagValue` (D-16) et les formes curryfiées (D-17) restent.

#### D-18.1 · Phase 1 faite — ✅ (18/11/2026, branche `d18-traduction-types`)

**`tsTypeToGo`** (`transformers/type/tsTypeToGo.ts`) :
- c'est le **seul** point de traduction des types ;
- il travaille sur les objets `Type` du checker, et non plus sur des nœuds de type ;
- les types écrits dans la source (`(one: number)`) passent par `typeNodeTransformer`, qui demande leur `Type` au checker puis appelle `tsTypeToGo` ;
- les paramètres et retours de fonction prennent toujours le type **résolu** par le checker, qu'il soit écrit ou inféré. Une fonction `void` n'a pas de retour Go ; une fonction qui renvoie `undefined` renvoie un `JSUndefined`.

**Les issues d'un Either** (`either/core/issues.ts`) sont lues sur le `Type` :
- les membres `Success`, `Fail`, `Error`, `Left` et `Right`, dont l'origine `@duplojs/lang` est vérifiée par le symbole ;
- leur information et le type de leur valeur, via `getTypeArguments` ;
- les autres membres comme valeurs brutes (`TagValue`).

**`EitherAny`** remplace `Either[T]` / `Either2[R, L]`, partout.

**Constructeurs** : de simples littéraux `EitherAny{Tag, Value}`. Il n'y a plus de « type cible » à calculer. Sont ajoutés :
- `DEither.error(v)` (issue `left` / `error`) ;
- `DEither.right("info", v)`.

**Helpers** : une seule version chacun, sur `EitherAny`. Le type `T` est celui que le callback TypeScript déclare, inféré par Go, et l'assertion `input.Value.(T)` ouvre la valeur.

| Helper | Signature |
|---|---|
| `WhenIsRightOtherwise[T, U]` | `(input EitherAny, onRight func(T) U, otherwise func(EitherAny) U) U` |
| `MatchInformation[U]` | `(input EitherAny, handlers []func(any) U) U` : chaque handler est enveloppé pour ouvrir **sa** valeur avec **son** type |
| `RightThen[T]` | `(input EitherAny, next func(T) EitherAny) EitherAny` |
| `WhenIsRight[T, V]` | `(input EitherAny, onRight func(T) V) EitherAny`, avec `TagValue` |

**Limites levées** :
- `matchInformation`, `rightPipe` et `whenIsRight` sur des issues de types différents ;
- une étape de `rightPipe` qui change de type ou renvoie une valeur brute (rangée dans un `success`, comme DuploJS) ;
- `whenIsRight` avec un callback qui renvoie un Either (même comportement que `RightThen`).

**Adaptation des callbacks** (`either/core/callback.ts`), automatique :
- moins de paramètres déclarés que reçus ;
- `any` reçu alors qu'un type précis est attendu : assertion ;
- type de retour différent de celui attendu par le helper.

**Valeurs `null` / `undefined`** (`expression/nullish.ts`) : `JSNull{}` / `JSUndefined{}`, des marqueurs de taille nulle.

**`print`** marche avec `EitherAny` (lecture de `Value` par réflexion), avec une **correction** : la 4ᵉ clé (`…/success: null`) n'est affichée que pour `success`, `error` et `fail`, comme dans Node. Un `left("x")` ou un `right("x", v)` n'en a pas.

**`build.ts`** : une dépendance par défaut (`JSNull`…) enregistrée explicitement n'est plus déclarée deux fois.

**Vérifié** :
- `tests/ts-types/` (15 contrôles) :
  - les signatures Go générées, lues par réflexion (`number & Positive` donne `float64`, `"a" | "b"` donne `string`, `string | number` donne `any`, l'union du prof donne `EitherAny`…) ;
  - les valeurs ;
  - l'affichage des issues du code du prof, **identique à Node** (obtenu en exécutant le même code avec `tsx`) ;
- les 6 autres tests d'exécution, mis à jour pour `EitherAny`, `check.sh 00`, les types et le lint (0 avertissement).

**Pas encore fait (phases 2 à 4)** :
- ~~la lecture typée lors du narrowing~~ (D-18.2) ;
- ~~`unwrapRight`, `isLeft`~~ (D-18.2) ;
- ~~les tableaux, objets, tuples, fonctions et `Promise`~~ (D-18.3) ;
- ~~`JSStringLength`~~ (D-18.4).

#### D-18.2 · Phase 2 faite — ✅ (18/11/2026, branche `d18-phase2-narrowing`)

**Adaptation centrale des expressions** (`expression/adapt.ts`). Toute expression passe par `expressionTransformers`, qui enveloppe désormais les transformeurs bruts (`rawExpressionTransformers`). Pour chaque expression, on compare trois types connus de TypeScript :
- **produit** : ce que le Go de l'expression fabrique vraiment. Pour un identifiant, c'est le type **déclaré** de la variable (`value: string | Fail` reste un `EitherAny` en Go, même là où TS l'a rétréci) ; sinon, le type au point ;
- **rétréci** : `getTypeAtLocation` (après `isLeft`, `if`, `||`…) ;
- **attendu** : `getContextualType` (paramètre appelé, type de retour).

La cible est le type attendu s'il est concret ou Either, sinon le type rétréci.

| produit | cible | Go |
|---|---|---|
| `EitherAny` | concret `T` | `x.Value.(T)` |
| `EitherAny` | `any` | `x.Value` |
| `any` | concret `T` | `x.(T)` |
| brut | `EitherAny` | `EitherAny{Tag: TagValue, Value: x}` (D-16) |

Dans les autres cas, ou si un des types n'est pas encore traduisible (fonction, générique), l'expression est gardée telle quelle. Le sondage des types passe par un contexte « silencieux » qui n'ajoute pas d'import : un import Go inutilisé ne compile pas.

**`isLeft`** : `x.Tag.IsLeft()`, avec une table `eitherTagIsLeft` remplie pour les tags left. `TagValue` n'est ni right ni left, comme dans DuploJS.

**`unwrapRight`**, choisi d'après le type du résultat donné par TypeScript :
- entrée sans Either : renvoyée telle quelle ;
- résultat sans Either (que des issues right) : `x.Value.(T)` ;
- résultat `any` : `x.Value` ;
- résultat encore union d'Either (`number | Fail`) : helper `UnwrapRight(input EitherAny) EitherAny` (la valeur extraite devient `TagValue`).

Passé comme fonction (`pipe(x, DEither.unwrapRight)`), il devient une fonction Go littérale typée par le type **attendu** (la signature générique n'est pas instanciée). `translateCurried` et cette forme partagent `translateFunctionValue` (`either/core/operand.ts`).

**Vérifié** : `tests/narrowing/` (12 contrôles, valeurs attendues obtenues avec `tsx`), les 7 autres tests d'exécution, `check.sh 00`, les types et le lint.

**Limite** : la lecture après narrowing (`EitherAny` → `x.Value.(T)`) est implémentée, mais aucun test ne l'exerce encore. Sans `if`, `const` ni ternaire (étape 6), on ne peut pas écrire de narrowing transpilable : `isLeft(x) || f(x)` donne `true | number`, qui n'a pas de traduction Go simple. Un test sera ajouté dès que l'étape 6 apporte le `if`.

#### D-18.3 · Phase 3 faite — ✅ (18/11/2026, branche `d18-phase3-types`)

`tsTypeToGo` traduit maintenant les types composés. Seule la **traduction des types** est faite ici : les expressions (`[1, 2]`, `{ name }`, `value.name`, fonctions fléchées) restent à l'étape 6, qui s'appuiera sur ces types.

| TypeScript | Go |
|---|---|
| `T[]`, `readonly T[]` | `[]T` |
| tuple `[A, B]` | ~~`[2]T` ou `struct{ V0 A; V1 B }`~~ → `[]A` / `[]any` depuis D-18.5 |
| objet `{ name: string }` | struct anonyme `struct{ Sourced_name string }` |
| `Record<string, T>`, `{ [key: string]: T }` | `map[string]T` (`map[float64]T` pour une clé `number`) |
| fonction `(a: A, ...rest: B[]) => R` | `func(A, ...B) R` ; `void` : pas de retour |
| `Promise<T>` | `T` (D-11) |
| paramètre de type `T` non résolu | `any` |

**Choix.**
- **Noms des champs** : `createSourceIdentifier` (`Sourced_name`), comme les autres identifiants venus de la source. Le champ est exporté, et un nom TS qui n'est pas un identifiant Go valide est échappé de la même façon.
- **Structs anonymes** : Go traite deux structs anonymes de même forme comme le même type, ce qui correspond au typage structurel de TS. Vérifié : une valeur construite côté Go traverse la fonction transpilée et reste `==`.
- **Types récursifs** (`interface Node { next: Node }`) : erreur claire `recursive-type-not-supported-yet`, au lieu d'une boucle infinie. Il faudrait un type nommé (`type Node struct { Next *Node }`) ; ce sera fait si un projet en a besoin.
- **Refusés pour l'instant**, avec une erreur claire : fonctions surchargées, objets à la fois appelables et porteurs de propriétés, objets avec à la fois des propriétés et une signature d'index.

**Effet sur la phase 2** : les types de fonction sont maintenant traduisibles, donc l'adaptateur voit les fonctions comme des types concrets ; il ne les modifie pas (produit et cible de même nature).

**Vérifié** : `tests/composite-types/` (17 contrôles : signatures lues par réflexion, allers-retours d'objet, de tuple et de map, callback appelé, `Success<number[]>`), les 8 autres tests d'exécution, `check.sh 00`, les types, le lint, et l'erreur sur un type récursif.

#### D-18.4 · Phase 4, chaînes — ✅ (19/11/2026, branche `d18-phase4-strings`)

**Problème.** Une `string` Go contient de l'UTF-8 ; JavaScript compte en **unités UTF-16**. `"é".length` vaut 1 en JS et `len("é")` vaut 2 en Go ; `"😀".length` vaut 2 en JS et 4 octets en Go. Toutes les fonctions à positions donnaient donc des résultats faux sur du texte non ASCII.

**Choix.** On garde la `string` Go (UTF-8), sans conversion en `[]uint16` : les fonctions convertissent les positions UTF-16 en octets seulement quand c'est nécessaire.
- **Chemin rapide** : si `len(value)` égale la longueur UTF-16, le texte est ASCII et `value[from:to]` est pris tel quel, sans copie.
- `includes`, `startsWith` et `endsWith` ne manipulent pas de positions : `strings.Contains` / `HasPrefix` / `HasSuffix` donnent directement le bon résultat.
- Une position qui tombe **au milieu d'un emoji** (paire UTF-16) produit `U+FFFD`, exactement ce que Node affiche pour une moitié de paire.

**Fonctions traduites** (`duplojs/string/core/`), formes avec données et curryfiées (`DCommon.pipe(text, DString.slice(0, 2))`) :
`length`, `slice`, `substring`, `charAt`, `at`, `indexOf`, `includes`, `startsWith`, `endsWith`, `toUpperCase` et `toLowerCase`. `DString.length` passé comme fonction donne directement le helper `func(string) float64`.

Elles suivent les règles d'ECMAScript : `ToIntegerOrInfinity` (`NaN` donne 0, troncature), positions négatives depuis la fin pour `slice` et `at`, inversion des bornes pour `substring`, `undefined` pour `at` et `indexOf` hors de la chaîne (`JSUndefined`).

**Casse.** Go et Node 24 utilisent la même version d'Unicode (17). La comparaison sur **tous** les points de code ne montre que deux écarts, corrigés :
- 102 caractères dont la majuscule en donne plusieurs (`ß` → `SS`, ligatures, grec à iota souscrit) et `İ` → `i̇` en minuscule. Table générée depuis Node (`core/caseMapping.ts`), appliquée par un `strings.Replacer` avant `strings.ToUpper` / `ToLower` ;
- la règle **Final_Sigma** : `Σ` en fin de mot devient `ς` (`ΟΔΟΣ` → `οδος`). Le chemin lent ne s'exécute que si le texte contient un `Σ`.

**Vérifié.**
- `tests/strings/` : **6 438 cas** (6 040 à l'origine) générés depuis Node par `tests/strings/generate.ts` (9 textes ASCII, accentués, emojis, `ß`, `İ`, ligature, accent combinant, grec × 13 positions, dont `NaN`, `±Infinity`, décimales et négatives × 6 recherches). 0 échec.
- Casse comparée sur **4 448 244 cas** (chaque point de code en majuscule et en minuscule, et le sigma placé avant ou après chacun) : 0 écart. Cette vérification lourde n'est pas dans la suite de tests.
- Les 10 autres tests d'exécution, `check.sh 00`, les types et le lint.

**Corrections après review (19/11/2026).**
1. **Bug** : `DString.at` renvoyait toujours `any`. Sur une chaîne contrainte (`string & MinCharacters<1>`), TypeScript sait que `at(text, 0)` est une `string`, et le Go ne compilait pas (`cannot use JSStringAt(...) (any) as string`, reproduit avec l'ancien code). Les specs `at` et `indexOf` portent maintenant `returnsAny`. Le handler compare le type Go du helper au type TS de l'appel, et ouvre le résultat par assertion quand ce dernier est plus précis. Le contrat de D-18.2 est respecté : le Go produit a le type Go du type TS.
2. **Perf** : `JSStringLength` fait **un seul parcours des octets**, sans décoder. Chaque octet de tête compte 1, et un octet `>= 0xF0` compte 1 de plus.
3. **Perf** : une sous-chaîne non ASCII ne copie plus rien. On cherche les octets de début et de fin, puis `value[start:end]` partage la mémoire. La copie avec `U+FFFD` n'a lieu que si une paire UTF-16 est coupée (`jsStringSplitUnits`).
4. La recherche de la spec utilise `Object.hasOwn`, pour qu'un nom comme `toString` ne trouve pas `Object.prototype`.
5. **Trouvé en ajoutant les tests manquants** : `DString.toUpperCase` passé comme fonction a un type générique (`<S extends string>(s: S) => ToUpperCaseOutput<S>`) que `tsTypeToGo` refusait. Un type non résolu (paramètre de type, type conditionnel) est maintenant traduit par **sa contrainte**, calculée par TypeScript (`getBaseConstraintOfType` : `S extends string` donne `string`) ; sans contrainte, il donne `any`.
6. **Tests** : formes curryfiées des 8 fonctions qui en ont une (`charAt`, `at`, `indexOf`, `startsWith` et `endsWith` ajoutées), `toUpperCase` / `toLowerCase` passées en valeur, et régression du bug 1. Au total, **6 438 cas**.

**Limites.**
- Une moitié de paire **recollée** (`slice` puis concaténation) ne redonne pas l'emoji : Go a déjà remplacé chaque moitié par `U+FFFD`. Une chaîne JS mal formée n'a pas de représentation UTF-8.
- Pas encore traduits : `split`, `replace`, `test` (les regex Go n'ont pas la même syntaxe), `padStart`… Ils seront ajoutés quand un projet en aura besoin, avec le même handler générique (`core/stringFunction.ts`).
- Les littéraux de chaîne (`"abc"`) restent à l'étape 6 : les tests passent les chaînes depuis Go.

#### D-18.5 · Tableaux pour `DArray` (étape 8b) — ✅ (19/11/2026, branche `etape-8b-darray`)

`DArray.map` et `DArray.coalescing` ont imposé quatre changements à la couche de types. Ils sont partagés par tous les domaines.

1. **Un tuple devient une slice** (modifie D-18.3) : `[A, A]` donne `[]A`, et `[A, B]` donne `[]any`. Ce n'est plus `[2]A` ni `struct{ V0 A; V1 B }`.
   - **Pourquoi** : les projets 05 à 07 produisent `readonly [number] | readonly number[]` (`whenIsRightOtherwise(DArray.coalescing, () => [-12])`). Avec `[1]float64` et `[]float64`, cette union devenait `any`, et `DArray.map` ne pouvait plus être typé. Avec des slices, c'est un seul type, `[]float64`.
   - C'est aussi **plus fidèle** : un tuple JS est passé par référence, comme une slice Go, alors qu'un `[N]T` Go est copié.
   - Un tuple hétérogène devient `[]any`, lu par assertion comme `EitherAny` : TypeScript connaît le type de chaque position.
2. **Intersection** : on garde le seul membre qui porte la valeur, **primitif ou tableau**. Avant, c'était seulement un primitif. `DArray.map` sur un tuple renvoie `readonly string[] & <contrainte de longueur>`.
3. **Type non résolu** (`T`, conditionnel) : sa contrainte, mais seulement si elle est traduisible, sinon `any`. La contrainte est d'abord sondée avec un contexte qui n'enregistre aucune dépendance : un échec à mi-chemin laisserait un import Go inutilisé. Exemple : `coalescing<V extends AnyValue>`, où `AnyValue` est l'union de toutes les valeurs.
4. **Callback générique passé en valeur** (`whenIsRightOtherwise(DArray.coalescing, …)`, `map(xs, DString.to)`) : `transformCallback` lit les **types** dans la signature instanciée attendue par le contexte, celle avec laquelle le Go est produit. Il garde le **nombre** de paramètres déclaré par la fonction : `map` fournit `(element, { index, self })` à `DString.to`, qui n'en déclare qu'un.

**`DArray.map`** (`duplojs/array/map/`) : helper générique, avec une seule allocation (la slice de sortie, à sa taille finale).
```go
func Map[T any, U any](input []T, theFunction func(T, struct{ Sourced_index float64; Sourced_self []T }) U) []U
```
Le second paramètre est `MapTheFunctionParams` (`{ index, self }`), un struct anonyme passé par valeur. Ses champs portent les noms produits par `tsTypeToGo` (`Sourced_index`, `Sourced_self`) : Go ne considère deux structs anonymes identiques que si leurs champs le sont. Un callback qui déclare moins de paramètres est enveloppé. Forme avec données et forme curryfiée (dans un `pipe`).

**`DArray.coalescing`** (`duplojs/array/coalescing/`) : le `instanceof Array` de DuploJS est **décidé à la compilation**, d'après le type TS.
- tableau ou tuple : l'expression telle quelle, sans aucun coût à l'exécution ;
- valeur : la slice `[]T{value}` ;
- les deux (`number | number[]`, `unknown`) : erreur claire `coalescing-of-array-or-value-not-supported-yet`.

Passé comme fonction, il devient une fonction Go littérale typée par le type attendu.

**Vérifié** : `tests/arrays/` (14 contrôles, valeurs de Node) couvre `map` avec données, curryfiée, sur un tuple et avec `DString.to`, ainsi que `coalescing` sur une valeur, un tableau et un tuple. Il reproduit aussi les formes **exactes** du projet 02 (`whenIsRight(result, DArray.coalescing)`) et des projets 05 à 07 (`pipe` + `whenIsRightOtherwise(coalescing, …)` + `map(DString.to)`). Les 12 autres tests d'exécution, `check.sh 00`, les types et le lint passent aussi.

**Cas compliqués** (`tests/maps-advanced/`, 9 cas). Chaque résultat est affiché avec `Inspect` (ce que fait `DCommon.print`) et comparé, caractère pour caractère, à `util.inspect` de Node : les deux `map` du projet 08 (helper Either curryfié comme callback, `rightPipe` dans le callback), un `map` qui produit des Either, des `map` imbriqués, un tableau d'objets, un callback générique et un tuple hétérogène. Deux bugs trouvés et corrigés :
- un **callback générique du projet** (`identity<T>`, compilé en `func(any) any`) : `transformCallback` ne prend la signature instanciée que pour une fonction **DuploJS**, et le wrapper ouvre le `any` renvoyé par assertion ;
- **affichage d'un objet** : `print` montrait `Sourced_name`. Les champs portent maintenant le tag `json:"<nom TS>"`, que `print` lit déjà. Le tag fait partie du type Go : le struct `{ index, self }` de `Map` porte donc les mêmes tags.

Non couvert : les `Map` JavaScript (`new Map()`) donnent une erreur claire (`recursive-type-not-supported-yet`) et ne sont utilisés par aucun projet. Les déclarations `type X = …` / `interface X` font échouer la transpilation (aucun transformeur) : il faut les ignorer, puisque Go n'en a pas besoin.

**Limites** : le second paramètre `{ index, self }` n'est lisible qu'avec l'accès aux propriétés et la déstructuration de l'étape 6. Les projets 02 à 09 restent bloqués par `const` (étape 6), mais n'attendent plus `DArray`.

#### D-18.6 · Déclarations `type` et `interface` — ✅ (19/11/2026, branche `etapes-revision`)

`type X = …` et `interface X { … }` (exportées ou non) **ne produisent rien en Go**. Elles sont sautées dans `transformSourceFile.ts`, comme les `import` (`declaration/typeOnly.ts`). C'est sans perte : le checker résout ces noms partout où ils servent (`tsTypeToGo`), et un objet devient un struct anonyme qui n'a pas besoin de nom.

**Vérifié** : `tests/type-declarations/` (alias de primitif, union d'Either, `interface` imbriquée, tableau d'`interface` passé à `map`, alias de tuple, affichage avec les noms TS).

**Limite** : une déclaration de type écrite **dans** une fonction n'est pas encore sautée. Il faut le faire dans `statement/block.ts`, que l'étape 6 est en train de modifier.

### D-11 · Asynchrone (projet 10) — ✅ (19/11/2026, branche `feat/step-10`)
### D-19 · Couvrir plus de cas que les exercices — ✅ (19/11/2026, branche `couverture-langage`)

**Méthode.** Les projets 00 à 09 passent, mais ils n'utilisent qu'une petite partie du langage. Une **sonde** a transpilé 24 petits programmes dans le style DuploJS, avec des constructions absentes des exercices : 8 passaient, 16 échouaient. Ce sont ces 16 manques qui ont été traités, par ordre de fréquence dans du vrai code.

| Construction | Go | Fichier |
|---|---|---|
| `user.name`, `team.leader.name` | `user.Sourced_name` | `expression/access.ts` |
| `values.length` / `text.length` | `float64(len(values))` / `JSStringLength(text)` (UTF-16) | idem |
| `values[i]` (`T \| undefined`) | `JSElementAt(values, i)` : `undefined` hors du tableau | idem |
| `tuple[1]` | `tuple[1]`, ou `tuple[1].(T)` si la slice est un `[]any` | idem |
| `record.key`, `record[key]` | `JSMapGet(record, key)` : `undefined` si la clé est absente | idem |
| `{ name, age: 3 }` | littéral du struct anonyme, type **attendu** préféré (ordre des champs) ; `map[string]T{…}` pour un `Record` | `expression/objectLiteral.ts` |
| `x = e`, `+=`, `-=`, `*=`, `/=`, `x++`, `x--`, `values[i] = e` | idem en Go | `statement/assignment.ts` |
| `for (const v of tableau)` | `for _, v := range tableau` | `statement/loop.ts` |
| `for (const c of texte)` | `for _, r := range texte { c := string(r) }` : des **caractères**, comme JS | idem |
| `while (c)` | `for c {}` ; si `c` a besoin de préparation, elle est **réévaluée à chaque tour** | idem |
| `for (let i = 0; i < n; i++)` | `for i := …; …; i += 1` (même règle pour la condition) | idem |
| `break`, `continue` | idem | idem |
| `switch` | `switch` Go ; `case` vides regroupés ; **`fallthrough`** quand JS enchaîne faute de `break` | `statement/switch.ts` |
| `` `${a} b` `` | `JSToString(a) + " b"` (`String()` de JS : nombres, booléens, `null`, tableaux `1,2`) | `expression/javascriptOperators.ts` |
| `typeof x` | `JSTypeOf(x)` ; le narrowing qui suit passe par l'adaptateur (`x.(string)`) | idem |
| `a ?? b` | `b` évalué **seulement** si `a` est `null` / `undefined` | idem |
| `Math.*` | paquet `math` ; `Math.round` et `Math.sign` par helper (JS arrondit `-2.5` à `-2`, Go à `-3`) ; `max` / `min` dépliés | `expression/math.ts` |
| `(v, { index }) =>`, `const { a, b } = o`, `const [x, y] = t` | une variable par nom, lue sur la source | `expression/destructuring.ts` |
| `type` / `interface` **dans une fonction** | rien (complète D-18.6) | `statement/block.ts` |
| `DEither.group({ a, b: () => f() })` | sur place : valeurs évaluées dans l'ordre, fonctions appelées **seulement à leur tour**, premier échec renvoyé, sinon `success` de l'objet | `duplojs/either/group/index.ts` |

**Helpers Go** (`expression/javascriptValues.ts`) : `JSElementAt`, `JSMapGet`, `JSIsNullish`, `JSTypeOf`, `JSToString`. Ils ne servent que quand le type Go est `any`. Quand TypeScript connaît le type, le transformer produit directement le bon type.

**Choix transverses.**
- **Un module de construction partagé** (`transformers/shared/goBuilder.ts`) pour écrire du Go avec l'AST. Chaque fichier en avait réécrit un ; les nouveaux helpers l'utilisent.
- **L'adaptateur** (D-18.2) traite un accès à une propriété comme une variable : le Go produit a le type de la **déclaration** du champ, pas le type rétréci.
- **Modifier un objet est refusé** (`obj.champ = e`, erreur `object-mutation-not-supported-yet`) : un struct Go est **copié**, un objet JS est **partagé**. La modification serait perdue sans prévenir. Une slice partage sa mémoire, donc `values[i] = e` est accepté (hors limites, Go s'arrête là où JS agrandirait le tableau).

**Vérifié.**
- `tests/language-extended/` : **86 cas** générés depuis Node, affichage comparé caractère pour caractère à `util.inspect`. Ils comprennent, pour la première fois exécuté, **le narrowing après `if (DEither.isLeft(x))`** (limite de D-18.2), `Math.round(-0.4)` qui donne `-0`, un emoji compté comme un seul caractère par `for…of`, et la paresse de `group` (compteur d'appels).
- Les autres tests d'exécution, les projets 00 à 09, `tsc`, les types et le lint.

**Restent refusés, avec une erreur claire** : `?.`, `do … while`, `for … in`, étiquettes, `%=` et `??=`, décomposition `...`, clé calculée, déstructuration au niveau du module, `text[i]` (utiliser `DString.at`), méthodes des tableaux et des chaînes (`values.map` : utiliser `DArray` / `DString`), `Map` / `Set` de JS, classes.

### D-20 · Objets `any` : un objet sans interface utilisé comme objet typé — ✅ (19/11/2026, branche `objets-any`)

**Le scénario** : une fonction renvoie un `User` bien construit ; une autre renvoie un `any` construit sans l'interface (`const raw: any = { … }; return raw;`) ; on lit aussi `raw.name` directement. Un test sur `main` a montré que **rien ne passait** : le Go ne compilait pas, et `raw.name` était refusé.

**Quatre corrections.**
1. **Déclaration typée** (`statement/variable.ts`). `const raw: any = {…}` donnait `raw := {…}` : Go donnait à `raw` le type de l'objet, l'adaptateur croyait ensuite que c'était un `any`, et le Go ne compilait plus. Quand le type écrit en TS diffère du type de la valeur, la variable est maintenant déclarée `var raw any = {…}`.
2. **`JSAs[T](valeur)`** (`expression/javascriptObjects.ts`). Un `any` utilisé là où un objet ou un tableau typé est attendu est **recopié champ par champ, par nom** (le tag `json:"name"`), quel que soit l'ordre, y compris pour les tableaux d'objets. Si la valeur a déjà exactement le bon type, elle est renvoyée telle quelle, sans copie. L'adaptateur (D-18.2) l'insère à la place d'une assertion `x.(T)`, qui ne marchait que pour un struct identique.
3. **`JSGetProperty(valeur, "nom")`** : `raw.name`, `raw["name"]` ou `raw[cle]` sur un `any` lisent le champ par nom à l'exécution, comme JS. Une propriété absente donne `undefined`, et `raw.length` marche sur un tableau ou une chaîne (en UTF-16).
4. **Littéraux `true` / `false`** (`expression/booleanLiteral.ts`) : ils n'étaient pas traduits, un trou de l'étape 6 trouvé par ce test.

**Deux ajustements liés.**
- Un objet littéral **dans un tableau** prend le type d'élément du tableau. Sinon, `[{ name, age }, { age, name }]` donnait deux structs différents, que Go refuse dans une même slice.
- `print` **n'affiche plus un champ qui vaut `undefined`** : un champ facultatif absent (`nickname?: string`) n'apparaît pas, comme dans Node.

**Ce qui ne peut pas être identique à JS** (un struct a une forme fixe ; c'est documenté et testé) :
- un **champ en trop** dans l'objet `any` est perdu (`admin: true` disparaît) ;
- l'**ordre d'affichage** suit le type TS, et non l'ordre d'écriture de l'objet ;
- un **champ du mauvais type** (`age: "36"` pour un `number`) ou un champ obligatoire **absent** arrête le programme avec un message clair (`JSAs : valeur.age est un string, float64 attendu`) au lieu de produire un résultat faux. TypeScript fait confiance au `any`, mais Go doit savoir ce qu'il range.

**Vérifié** : `tests/any-objects/` (11 cas, les écarts ci-dessus vérifiés tels quels), plus les autres tests d'exécution, les projets 00 à 09, `tsc`, les types et le lint.

### D-21 · Objet plus grand passé à un type plus petit : l'objet temporaire — ✅ (19/11/2026, branche `d21-objet-temporaire`)

**Le cas** (posé par le prof) : `function test(arg: { name: string })` appelée avec un `User` complet (`{ id, name, email, isActive }`).

- **TypeScript accepte** : son typage est *structurel*. `User` a au moins un `name`, donc il convient.
- **Go refuse** : `struct{ id; name; email; isActive }` et `struct{ name }` sont deux types différents. Le `go build` échoue.
- **Avant D-21** : l'adaptateur (D-18.2) ne convertissait qu'un `any` vers un objet typé (`JSAs`, D-20). Entre deux structs connus, il ne faisait rien.

**Choix : l'objet temporaire, construit à la compilation.** Les deux formes sont connues de TypeScript avant l'exécution. Le transpileur écrit donc directement un struct littéral qui ne contient que les champs attendus :
```go
Sourced_test(struct{ Sourced_name string }{
	Sourced_name: Sourced_user.Sourced_name,
})
```

**Pourquoi ce choix plutôt qu'un helper à l'exécution comme `JSAs`** :
- aucune réflexion ni recherche par nom : c'est une copie de cases, en général sur la pile ;
- impossible d'échouer à l'exécution, puisque TS a déjà vérifié que les champs existent ;
- on ne copie que ce que la fonction peut voir (TS lui interdit le reste).

**Implémenté** : `expression/structuralConversion.ts`, appelé par l'adaptateur (`expression/adapt.ts`) quand le type produit et le type attendu sont tous les deux concrets.
1. deux **structs** dont le rendu Go diffère : struct littéral de la cible, chaque champ lu par nom sur la source (`source.Sourced_x`) ;
2. champ lui-même objet : même règle, **récursivement** (`{ leader: { name } }`) ;
3. tableau d'objets (`User[]` vers `{ name: string }[]`) : nouvelle slice, élément par élément, dans une fonction littérale. C'est le seul cas qui alloue ;
4. champ facultatif attendu (`any` en Go) absent de la source : `JSUndefined{}`, comme JS ;
5. source qui n'est ni un nom ni un champ de nom (`makeUser()`) : passée en paramètre d'une fonction littérale `func(source S) T { return … }(valeur)`, donc **évaluée une seule fois** ;
6. garde-fou : seulement struct → struct et `[]struct` → `[]struct`. Une cible générique (`any`, `[]any`) ou une `map` reçoit la valeur telle quelle.
7. `const { name: label } = user` : TypeScript donne comme type « attendu » de `user` la forme du motif (`{ name: any }`). Ce n'est pas une vraie cible : l'adaptateur l'ignore (sinon il copie dans un objet de `any`, et `label + ":"` ne compile plus).

**Différence assumée** : l'objet temporaire n'a **que** les champs du type attendu. Si la fonction **renvoie** cet objet (`describe(person) { return person }`, ou un type de retour plus petit `summary(person: User): { name: string }`) et qu'on l'affiche, Go montre `{ name: 'John Doe' }` alors que Node montre l'objet complet. Le programme ne peut pas lire les autres champs (TS l'interdit) : seul l'affichage diffère.

**Pas encore couvert** : un objet passé à un `Record<string, T>` (struct → `map`), et une cible union d'objets.

**Vérifié** : `tests/structural-objects/` (7 cas : le cas du prof, objet imbriqué, tableau d'objets via `DArray.map`, champ facultatif absent, source évaluée une fois avec un compteur, type de retour plus petit, déstructuration), plus tous les tests d'exécution, les projets 00 à 10, `tsc`, les types et le lint.

**Lien avec D-20** : c'est la même idée que `JSAs`, mais calculée à la compilation. `JSAs` reste nécessaire quand la forme de départ est inconnue (`any`).

Support de présentation : `docs/objets-sous-types-et-any.md`.

### D-22 · Fonctions `DArray` courantes — ✅ (19/11/2026, branche `darray-fonctions`)

**Pourquoi maintenant** (étude du 19/11) : les exercices n'ont aucun `let`, aucune réaffectation ni boucle, et le lint DuploJS (`@duplojs/code-config`) impose `prefer-const` et `no-param-reassign`. Un code Duplo passe par la bibliothèque `@duplojs/lang`, dont le transpileur ne traduisait que 2 fonctions `DArray` sur 41. C'est là que la couverture Duplo progresse le plus.

**Traduites** (`duplojs/array/iteration/`), avec données et curryfiées (`pipe(list, DArray.filter(f))`) :

| DuploJS | Go (`shard_dependencies`) | Comme JS |
|---|---|---|
| `filter(list, f)` | `Filter[T](input, f) []T` | nouvelle slice |
| `find(list, f)` | `Find[T](input, f) any` | `undefined` si rien ne correspond |
| `findIndex(list, f)` | `FindIndex[T](input, f) any` | `undefined` si rien ne correspond (DuploJS, pas `-1`) |
| `some`, `every` | `Some`, `Every` → `bool` | arrêt au premier résultat décisif |
| `includes(list, v)` | `Includes[T comparable]` | `NaN` est trouvé (SameValueZero) |
| `push(list, ...v)` | `Push[T](input, values...)` | **copie** : l'entrée n'est pas modifiée |
| `concat(list, ...lists)` | `Concat[T](input, others...)` | une seule allocation |
| `length(list)`, `pipe(list, DArray.length)` | `float64(len(list))` | — |

Les callbacks reçoivent `(element, { index, self })`, comme `map`. Le routeur `DArray` est passé d'une chaîne de `DPattern.match` à une **table** (`arrayHandlers`), comme le routeur Either (PR #19), pour ne plus buter sur la limite de 16 arguments de `pipe`.

**Refusé avec une erreur claire** :
- `filter` avec un type guard qui change le type des éléments (`(A | B)[]` → `A[]`) ;
- `includes` sur des éléments non comparables en Go (tableaux, maps, fonctions) ;
- `concat` avec des valeurs isolées ou des tableaux d'un autre type.

**Différence assumée** : `includes` compare deux objets **par contenu** en Go (deux structs égaux) alors que JS compare les **références**.

**Vérifié** : `tests/darray-functions/` (14 cas comparés à Node), plus toute la suite.

### D-23 · `DArray.reduce` et ses outils — ✅ (19/11/2026, branche `darray-reduce`)

**Le cas** : en DuploJS, le callback de `reduce` reçoit un **objet d'outils** et dit comment continuer.
```ts
DArray.reduce(list, 0, ({ element, lastValue, next, exit }) =>
	element > 2 ? exit(lastValue) : next(lastValue + element));
```

**Choix** : en Go, cet objet devient un **struct** dont `next`, `exit` et `nextPush` sont des fonctions. Elles renvoient une `ReduceStep { Exit bool; Value any }` : continuer avec `Value`, ou s'arrêter et renvoyer `Value`.
```go
shard_dependencies.Reduce(Sourced_numbers, float64(0), func(params struct{ Sourced_element float64; …; Sourced_next func(float64) ReduceStep; … }) ReduceStep {
	Sourced_element := params.Sourced_element
	…
	return Sourced_next(Sourced_lastValue + Sourced_element)
}).(float64)
```
- **Pourquoi** : le corps du callback se traduit alors comme du code ordinaire (déstructuration, ternaire, `if` / `return`, `params.next(…)`), sans réécriture spéciale. Seule `tsTypeToGo` apprend les types de `reduce` : `ReduceTheFunctionParams<A, O>` → le struct d'outils, `ReduceNext` / `ReduceExit` → `ReduceStep`.
- Le struct est construit par **une seule fonction** (`reduceParamsType`), à la fois pour le helper générique (`T`, `O`) et pour le callback (vrais types) : Go exige deux structs strictement identiques.
- `nextPush` n'existe que si l'accumulateur est un tableau (helper `ReducePush[T, E]`). Il renvoie une copie, comme `DArray.push`.
- `DArray.reduceFrom(valeur)` devient simplement la valeur.
- Le résultat (`any`) est ouvert vers le type TS de `reduce` (`.(float64)`). S'il peut être de deux types (`exit("stop")` avec un accumulateur `number`), il reste `any`.
- `next`, `exit` et `nextPush` sont des fonctions sans capture : pas d'allocation par tour. Chaque `ReduceStep` range sa valeur dans un `any`.

**Correctif trouvé en route** : `[]` seul a pour TypeScript le type `never[]`. Un tableau littéral vide prend maintenant le **type attendu** à cet endroit (`reduceFrom<readonly string[]>([])` → `[]string{}`).

**Pas encore traduit** : `nextWithObject` (erreur claire).

**Vérifié** : `tests/darray-reduce/` (10 cas comparés à Node : somme, `index`, chaînes, `exit` du même type et d'un autre type, `nextPush` avec `reduceFrom`, forme curryfiée dans un `pipe`, paramètre non déstructuré, objet comme accumulateur, corps en bloc avec `if`), plus toute la suite.

### D-24 · Fonctions `DObject` — ✅ (19/11/2026, branche `dobject`)

**Constat** : toutes les fonctions `DObject` travaillent sur la **forme** de l'objet, et TypeScript la connaît à la compilation. Le résultat est donc construit directement, sans réflexion à l'exécution :
```go
// DObject.pick(user, ["name", "email"])
struct{ Sourced_name string; Sourced_email string }{Sourced_name: Sourced_user.Sourced_name, Sourced_email: Sourced_user.Sourced_email}
```

**Traduites** (`duplojs/object/`), avec données et curryfiées (`pipe(user, DObject.pick(["id"]))`) :

| DuploJS | Go |
|---|---|
| `pick`, `omit` (tableau ou objet de clés) | struct du type résultat, lu champ par champ sur la source |
| `assign(objet, valeur)` | champs de `valeur`, sinon ceux de `objet` (comme `{ ...objet, ...valeur }`) |
| `override(objet, valeur)` | idem, mais une valeur `undefined` ne remplace rien : `OverrideField` |
| `getProperty(objet, "clé")`, `getDeepProperty(objet, "a.b")` | `objet.Sourced_clé`, `objet.Sourced_a.Sourced_b` |
| `transformProperty(objet, "clé", f)` | struct avec `f(objet.clé)` à la place de `clé` |
| `keys`, `values`, `entries` | slice littérale construite depuis la liste des champs |
| `countKeys` | une constante (`float64(4)`) |

- La source n'est évaluée qu'une fois (variable temporaire si ce n'est pas un nom).
- Un champ dont la forme diffère (objet imbriqué) passe par la conversion structurelle de D-21.

**Correctifs trouvés en route** :
- un **objet littéral** est déjà construit au type attendu (`objectLiteral.ts`) : l'adaptateur ne le reconvertit plus (sinon double conversion, qui ne compile pas) ;
- un **champ facultatif absent** d'un objet littéral (`{ name }` pour `{ name; nickname? }`) vaut maintenant `undefined`, comme en JS, et non le `nil` par défaut de Go.

**Refusé avec une erreur claire** :
- une clé qui n'est pas un littéral ;
- un objet dont la forme n'est pas connue (`any`, `Record`) ;
- `assign` avec un champ facultatif (JS distingue « absent » et « présent mais undefined », Go non) ;
- `keys`, `values`, `entries`, `countKeys` sur un objet à champs facultatifs (JS ne liste pas un champ absent).

**Différence assumée** : l'**ordre d'affichage** suit le type TS, comme en D-20. Le type de `assign` et `transformProperty` (`Omit<…> & { name }`) place le champ modifié en dernier, alors que JS le garde à sa place. Les valeurs sont identiques. Changer l'ordre en Go donnerait un autre type de struct, incompatible avec le reste du programme.

**Pas encore traduites** : `to`, `transformProperties`, `fromEntries`, `hasKeys`, `deepOverride`, `discriminate*`, `entry`, `is`, `isSimple`.

**Vérifié** : `tests/dobject/` (15 cas comparés à Node, dont les 2 écarts d'ordre vérifiés tels quels), plus toute la suite.

### D-25 · Fonctions `DNumber` — ✅ (19/11/2026, branche `dnumber`)

**Toutes les fonctions** du domaine `@duplojs/lang/number` (22 sur 22) ont un helper Go (`duplojs/number/sharedDependency.ts`) :

| Groupe | Fonctions | Go |
|---|---|---|
| comparaisons | `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, `betweenThan`, `betweenThanOrEqual` | `value > threshold`… |
| tests | `isEven`, `isOdd`, `isMultipleOf` | `math.Mod` (le `%` de JS, même signe) |
| | `isInteger` | fini et `math.Trunc(v) == v` |
| | `isSafe` | strictement entre `±9007199254740991` |
| | `isNegative`, `isPositive`, `isStrictNegative`, `isStrictPositive`, `isNotZero` | comparaison à `0` |
| listes | `sum`, `maxOf`, `minOf` | la boucle de DuploJS |
| | `max`, `min` | `Math.max(...v)` : `NaN` contagieux, `-Infinity` si vide, `+0 > -0` |
| | `sort(list, "ASC" \| "DSC")` | copie triée, stable (`sort.SliceStable`) |

**Pourquoi un helper par fonction** : en Duplo, on passe souvent ces fonctions **en valeur** (`DArray.filter(list, DNumber.isEven)`). `DNumber.isEven` devient alors simplement `shard_dependencies.NumberIsEven`, une fonction Go `func(float64) bool`. La forme curryfiée (`DNumber.greaterThan(2)`) devient une fonction littérale, avec le seuil évalué une seule fois.

**Vérifié** : `tests/dnumber/` (39 valeurs comparées à Node, dont `NaN`, `Infinity`, `-0`, nombres négatifs, `2^53`, tableau vide, `filter` avec `DNumber.isEven` et `DNumber.greaterThan(2)`), plus toute la suite.

### D-11 · Asynchrone (projet 10) — 🟡
- Il n'y a aucune vraie entrée/sortie, donc une **exécution synchrone** (`Promise<T>` traduit en `T`) préserve l'ordre et le résultat.
- Goroutines et channels seulement en bonus, si on a le temps.
- `async` ne produit aucun élément particulier dans une déclaration de fonction Go ;
  `await expression` devient simplement `expression`. L'expression interne est
  transformée une seule fois, puis le résultat reste adapté au type attendu par
  le parent (notamment l'assertion nécessaire après un `Promise<any>`).
- `rightAsyncPipe` réutilise `RightThen` et déballe avec le checker les types
  `Promise` de l'entrée et des callbacks.
- `asyncPipe` est déroulé exactement comme `pipe`.
- `asyncGroup` suit l'implémentation DuploJS observée : les getters sont exécutés
  **séquentiellement**, le premier `Left` est retourné immédiatement, sinon leurs
  valeurs forment un `Success<[]>`. Le helper partagé `AsyncGroup[E, T]` accepte
  aussi bien des getters que des valeurs `Either` ; le handler fournit les deux
  types depuis le checker. Les littéraux et les tableaux stockés sont couverts.
- La forme objet littérale est traduite vers un struct Go typé. Le helper
  `AsyncGroupObject[O]` reçoit des getters et des assignateurs de champs typés,
  conserve les clés et court-circuite avant d'appeler les getters suivants.
- Un tableau local stocké mélangeant getters et valeurs utilise une slice `[]any` ;
  le handler connaît le littéral d'origine et restaure le type de chaque position.
  Un tableau mixte opaque reçu depuis un autre module reste refusé, puisqu'il ne
  fournit plus cette information statique et nécessiterait une réflexion runtime.
- **Vérifié** : `tests/async/` (20 contrôles), compilation et `go vet`, et
  `check.sh 10` (sortie identique à TypeScript).

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
- **Les PR s'ouvrent sur le fork, jamais sur le dépôt `duplojs`** (ajout du 18/11/2026). Sur un fork, `gh pr create` vise par défaut le dépôt **d'origine**, celui des organisateurs. Il faut toujours préciser le dépôt :
  ```bash
  gh pr create --repo TizaouiKha/hackathon-11-2026 --base main --head <ma-branche>
  ```

---

## Revues de code

Les remarques de relecture des PR, pour ne pas les perdre. Statuts : 🔴 à corriger avant le merge · 🟡 à traiter plus tard · ✅ traité.

### R-01 · Étape 5 — helper de préparation (Yacine, branche `etape-5-helper-preparation`) — relue le 18/11/2026
**Verdict : bon travail, à merger** une fois la PR déplacée sur le fork.

**Ce qui a été vérifié** (sur une branche locale qui réunit l'étape 5 et le `main` du 18/11, rien n'a été poussé) :
- le merge avec `main` (étapes 3, 7 et 8a) se fait **sans conflit**, alors que la branche part d'avant l'étape 8a ;
- **tous les tests passent** : `tests/preparation/` (le sien), `tests/either/`, `tests/either-helpers/`, `tests/pipe/`, `check.sh 00`, `test:types`, et `test:lint` sans avertissement ;
- le Go généré est plus lisible : `Value: Sourced_one + Sourced_two`, sans les 2 variables temporaires d'avant ;
- `&&` et `||` n'évaluent leur partie droite que si nécessaire. Le test le prouve avec un tag invalide qui planterait sinon ;
- `x / 0` passe par une variable, parce que Go refuse de compiler une division par la constante 0 ;
- **contrôle ajouté pendant la revue** : les opérations entre deux littéraux sont maintenant calculées par Go **à la compilation** (`float64(0.1) + float64(0.2)`). Le résultat est identique à JavaScript sur 6 cas : `0.1 + 0.2`, `0.1 * 3`, `1 / 3`, `0.7 + 0.1`, `1e16 + 1`, `5e-324 / 2`. Pas de différence de calcul.

**Remarques :**
1. 🔴 **PR ouverte sur le mauvais dépôt** : elle est sur [duplojs/hackathon-11-2026#5](https://github.com/duplojs/hackathon-11-2026/pull/5), le dépôt des organisateurs. Il faut la fermer et la rouvrir sur le fork (commande dans D-15). Sinon, elle ne peut pas être mergée dans notre `main`.
2. ✅ **(corrigé le 19/11/2026, voir « Correction de la remarque n° 2 » plus bas)** **Ordre d'évaluation avec les variables.** `transformPrepared` ne copie plus les identifiants dans une variable temporaire. Si un argument **suivant** modifie la variable, Go lira la nouvelle valeur alors que JavaScript lit l'ancienne :
   ```ts
   f(x, change())   // change() modifie x : TS passe l'ancien x, le Go généré le nouveau
   ```
   Ce n'est **pas possible aujourd'hui** : aucun transformer ne traduit encore d'affectation, et aucun exercice ne modifie de variable. Ça le deviendra avec les affectations de l'étape 6. **Correction proposée** : quand un opérand suivant a des instructions de préparation (`before` non vide), copier dans une variable les identifiants déjà préparés avant lui. C'est la règle du skill `typescript-to-go` : « conserver la valeur de chaque expression dans une déclaration locale avant de poursuivre l'évaluation suivante ».
3. 🟡 **Cohérence du contrat.** `transformPrepared` renvoie un objet simple `{ before, operand }` en cas de succès, alors que le reste du transpileur renvoie des résultats `DEither` (`context.success(...)`, `DEither.isLeft`). Ça fonctionne, mais un `DEither.right("prepared-operand", { before, operand })` serait plus cohérent avec D-04. Ce n'est pas bloquant.
4. ✅ **(corrigé, voir plus bas)** **À garder en tête pour l'étape 6** : `&&` et `||` sont traduits avec un résultat `bool`. En JavaScript, `a || b` renvoie **la valeur** de `a` ou de `b` (par exemple `0 || 5` vaut `5`). Les exercices n'utilisent `||` qu'entre des booléens (`one < 0 || two < 0`), donc c'est sans effet pour l'instant.

#### Correction de la remarque n° 2 (19/11/2026, branche `r01-ordre-evaluation`)
**Le bug, vérifié** : `f(x, change())` donnait en Go
```go
Generated_1 := Sourced_change()
Sourced_f(Sourced_x, Generated_1) // x lu après change() : JS passe l'ancien x
```
Même problème pour `x + change()`, `[x, change()]` et `{ a: x, b: change() }`. Pour l'objet, il existait même sans instruction sortie : Go garantit l'ordre des **appels**, pas le moment où il lit une variable.

**Correction** : `transformers/shared/sequence.ts`, `sequenceOperands`. Elle assemble les opérandes préparés (appelé et arguments d'un appel, gauche et droite d'un opérateur, éléments d'un tableau, valeurs d'un objet). Quand un opérande a des instructions préparatoires, chaque opérande précédent qui pourrait changer entre-temps est d'abord copié :
```go
Generated_2 := Sourced_x
Generated_1 := Sourced_change()
Sourced_f(Generated_2, Generated_1)
```
- les valeurs d'un objet littéral sont maintenant **préparées** comme des arguments d'appel ;
- **pas de copie inutile** : les littéraux, les variables temporaires, les `const`, les fonctions, les imports, et les `let` ou paramètres **jamais réaffectés** dans leur fichier (`=`, `+=`, `++`, recherche par nom, donc prudente) sont lus directement ;
- `{ x }` (forme courte) : le symbole lu est la variable, pas la propriété ;
- les template strings n'en ont pas besoin : chaque morceau est un appel (`JSToString(x)`), et Go garantit l'ordre des appels.

**Vérifié** : `tests/evaluation-order/` (9 cas comparés à Node : appel, opérateur, tableau, objet, forme courte, ordre des appels dans un objet, paramètre modifié par une fonction fléchée, constante, template string), plus toute la suite.

#### Revue adversariale (18/11/2026)
**But** : essayer de **casser** l'étape 5 avec des entrées TypeScript piégeuses. Chaque piège est transpilé dans son propre mini-projet, compilé, exécuté, puis comparé au **même code exécuté en JavaScript**. La base testée est l'étape 5 + `main` du 18/11.

**Résultat : l'étape 5 tient. 25 pièges sur 29 donnent la même valeur qu'en JavaScript, et les 4 qui échouent viennent d'un code qui existait avant elle.**

| Piège (TS) | JS | Go | |
|---|---|---|---|
| `1e308 * 10`, `1e308 + 1e308`, `1e308 + 1e308 + 1` | `Infinity` | `+Inf` | ✅ le dépassement est détecté et calculé à l'exécution |
| `1e-320 * 1e-10`, `1e-400` | `0` | `0` | ✅ |
| `0 / 0`, `x / 0`, `x / 0e5`, `x / 0 / 0` | `NaN`, `±Infinity` | idem | ✅ pas d'erreur Go « division by zero » |
| `0 / 0 === 0 / 0` | `false` | `false` | ✅ |
| `0 / x === 0` (x = -5, donne `-0`) | `true` | `true` | ✅ |
| `0.1 + 0.2 === 0.3`, `0.1 + 0.2 + 0.3`, `0.1 * 0.1`, `1 / 3 * 3` | `false`, `0.6000000000000001`, `0.010000000000000002`, `1` | idem | ✅ les calculs entre littéraux faits par Go sont identiques à JavaScript |
| `0x10 + 0b11`, `1_000 + 0.5`, `9007199254740993 + 0` | `19`, `1000.5`, `9007199254740992` | idem | ✅ |
| `isPositive(x) && isBig(x)`, `||`, et le mélange `isBig(x) \|\| isPositive(x) && isBig(add(x, 10))` | | idem | ✅ chaque appel n'est évalué que si nécessaire, même imbriqué |
| `add(add(x, 1), add(2, add(x, 3)))` | `8` | `8` | ✅ |
| **`1e400`** (littéral seul) | `Infinity` | ❌ `undefined: Infinity` | **bug d'avant l'étape 5** : TypeScript donne le texte `"Infinity"` pour ce littéral, et `numericLiteral.ts` le recopie tel quel en Go |
| **`x % 2`** | `1` | ❌ ne compile pas | **d'avant l'étape 5** : Go n'a pas de `%` sur les `float64` (il faut `math.Mod`) |
| **`x << 1`** (et `&`, `\|`, `^`, `>>`) | `6` | ❌ ne compile pas | **d'avant l'étape 5** : les opérateurs binaires de JS s'appliquent à des entiers 32 bits, et Go les refuse sur les `float64` |
| **`x \|\| y`** avec `y: number` | `5` | ❌ refusé à la transpilation | **d'avant l'étape 5** : voir la remarque 4 |

**Remarque sur l'ordre d'évaluation (n° 2)** : le problème reste réel, mais il est **impossible à déclencher aujourd'hui**. Sans affectation, aucun argument ne peut modifier une variable lue avant lui. À corriger en même temps que les affectations (étape 6).

**Nouveaux points** (sans lien avec l'étape 5, aucun exercice concerné) :
- ✅ **`numericLiteral.ts`** : traduire un littéral qui vaut `Infinity` (`1e400`) en `math.Inf(1)`.
- ✅ **`binary.ts`** : `%` doit devenir `math.Mod(a, b)`. `<<`, `>>`, `&`, `|` et `^` doivent passer par une conversion en entier 32 bits, comme JavaScript.

#### Correction des 4 bugs (18/11/2026, commit `21a51b0` sur `etape-5-helper-preparation`)
Les 4 échecs de la revue adversariale sont corrigés **sur la branche de l'étape 5**. C'est là que `binary.ts` a été réécrit, ce qui évite les conflits.

| Bug | Correction | Fichier |
|---|---|---|
| `1e400` donne `undefined: Infinity` | un littéral qui vaut `Infinity` devient `math.Inf(1)` (avec `import "math"` dans le fichier) | `expression/numericLiteral.ts` |
| `x % y` ne compile pas | `math.Mod(x, y)` : même règle de signe (celui du dividende) et de `NaN` que JavaScript | `expression/binary.ts` |
| `&`, `\|`, `^`, `<<`, `>>`, `>>>` ne compilent pas | helpers partagés `JSBitwiseAnd`, `JSBitwiseOr`, `JSBitwiseXor`, `JSLeftShift`, `JSSignedRightShift`, `JSUnsignedRightShift` qui appliquent **ToInt32 / ToUint32** comme JavaScript (troncature, modulo 2³², `NaN` et `Infinity` donnent 0, décalage `& 31`) | `expression/javascriptNumber.ts` |
| `x \|\| y` entre nombres | renvoie **la valeur** d'un opérande comme JavaScript (`0 \|\| 5` donne `5`, `NaN && 5` donne `NaN`) ; le membre droit n'est évalué que si nécessaire. Entre booléens, rien ne change. Avec des types mélangés (`boolean \|\| number`), le refus est explicite, car aucun type Go ne représente `number \| true` | `expression/binary.ts` |

**Bonus trouvé en corrigeant** : si deux helpers partagés importaient le même paquet (`math` pour `JSNumberToString` et pour les opérateurs sur les bits), le fichier `shard_dependencies.go` contenait l'import **deux fois** et ne compilait pas. Les imports sont maintenant dédupliqués dans `build.ts`.

**Vérifié** :
- `tests/js-operators/` : **56 contrôles bit pour bit** contre les valeurs de Node, par exemple `-0 % 5` donne `-0`, `1e21 \| 0` donne `-559939584`, `1 << 33` donne `2`, `-1 >>> 0` donne `4294967295`, et `NaN && 5` donne `NaN` ;
- sur la branche de l'étape 5 : tous les tests, `check 00`, les types et le lint (0 avertissement) ;
- **intégration** (branche locale « étape 5 + `main` + `DString.to` ») : les 7 tests d'exécution passent, et un programme qui utilise `DString.to`, `|` et `%` ensemble compile avec un seul `import "math"`.

La remarque 4 est donc traitée : `&&` / `||` entre nombres renvoient bien une valeur. Les remarques 2 (ordre d'évaluation) et 3 (contrat `DEither`) restent 🟡 pour plus tard.

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
