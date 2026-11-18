# Étapes du hackathon — qui fait quoi

Ce fichier découpe le travail en étapes indépendantes, que chacun peut prendre.
Chaque étape indique : **le but**, **ce qu'il faut avoir lu**, **ce qu'il faut faire**, **où** (fichiers), **comment vérifier** et **quand elle est finie**.

- Les choix d'architecture sont dans [DECISIONS.md](DECISIONS.md) (références `D-xx`).
- L'état de chaque exercice est dans [EXERCICES.md](EXERCICES.md).
- **Avant de commencer une étape**, mets ton prénom dans la colonne « Qui » du tableau ci-dessous et pousse le fichier. Ça évite que deux personnes fassent la même chose.

---

## Vue d'ensemble

| # | Étape | Dépend de | Qui | État |
|---|---|---|---|---|
| 0 | [Installer l'environnement](#étape-0--installer-lenvironnement) | — | tout le monde | — |
| 1 | [Projet 00 qui compile](#étape-1--projet-00-qui-compile) | — | Claude | ✅ |
| 2 | [Script de vérification](#étape-2--script-de-vérification) | — | Claude | ✅ |
| 3 | [Représentation des `Either` en Go](#étape-3--représentation-des-either-en-go) | — | Claude | ✅ (branche `etape-3-either`) |
| 4 | [`print` fidèle à Node (`util.inspect`)](#étape-4--print-fidèle-à-node) | — | | ✅ |
| 5 | [Helper de préparation](#étape-5--helper-de-préparation) | — | | ⬜ |
| 6 | [Transformers de base du langage](#étape-6--transformers-de-base-du-langage) | 5 | | ⬜ |
| 7 | [Domaine Either (handlers)](#étape-7--domaine-either) | 3, 5 | Claude | 🟨 presque fini (branche `etape-7-either-helpers`) : il reste `group` (attend les types tableau, étape 6) |
| 8 | [Domaines Common / Array / String](#étape-8--domaines-common--array--string) | 4, 5 | Claude | 🟨 8a fait (`pipe`, formes curryfiées) ; 8b : `DString.to` fait (branche `etape-8b-dstring-to`), `print`, `map` et `coalescing` attendent les étapes 4 et 6 |
| 9 | [Valider les projets 01 → 09](#étape-9--valider-les-projets-01--09) | 6, 7, 8 | tout le monde | ⬜ |
| 10 | [Projet 10 (asynchrone)](#étape-10--projet-10-asynchrone) | 9 | | ⬜ |
| 11 | [Performance et finitions](#étape-11--performance-et-finitions) | 9 | | ⬜ |

```
3 (Either) ──┐
             ├──► 7 (handlers Either) ──┐
5 (helper) ──┼──► 6 (base du langage) ──┼──► 9 (projets 01→09) ──► 10 (async)
             └──► 8 (Common/Array/String)┘                      └─► 11 (perf)
4 (print) ───────► 8
```

**Les étapes 3, 4 et 5 peuvent démarrer tout de suite, en parallèle.** C'est le bon découpage pour 3 personnes au début.

Répartition conseillée pour 3 personnes :
- **Personne A** : étape 3, puis 7 (tout ce qui touche aux `Either`) ;
- **Personne B** : étape 5, puis 6 (le langage : variables, `if`, ternaire, fonctions fléchées…) ;
- **Personne C** : étape 4, puis 8 (`print`, `pipe`, `map`, `DString.to`) ;
- **Tout le monde** : étape 9, chacun valide les projets qui touchent son domaine.

---

## Règles communes (à lire une fois)

1. **On ne travaille pas sous Windows natif.** Le build y plante, à cause d'un problème de chemins dans DuploJS (D-01). Tout se lance depuis WSL Ubuntu. Tu peux éditer les fichiers depuis Windows (VS Code, etc.).
2. **Avant de coder un transformer**, lis `.agents/skills/typescript-to-go/SKILL.md`. Les points essentiels :
   - un transformer = une opération ;
   - contrat explicite `Transformer<GoAST.X>` ;
   - pour les API DuploJS : un **routeur** qui résout le symbole, puis un **handler** par fonction. On ne reconnaît jamais une fonction à son seul nom ;
   - listes de transformers en `DCommon.memo`.
3. **Pour construire du Go**, utilise les factories existantes `GoAST.create...` (dans `src/go/AST/`). N'en écris pas de nouvelles sauf si un nœud manque vraiment.
4. **Une étape est finie quand** :
   - `./.commands/check.sh NN` affiche ✓ pour les projets concernés ;
   - `pnpm test:runtime` passe (tests d'exécution de `tests/`, voir l'étape 2) ;
   - `pnpm test:types` et `pnpm test:lint` passent.

   Quand une étape ne peut pas encore être validée par un projet complet (par exemple parce qu'il manque `print`), **ajoute un test d'exécution** dans `tests/<nom>/` pour prouver que ton code marche.
5. **On note tout** : un choix dans `DECISIONS.md`, l'avancement et le Go obtenu dans `EXERCICES.md`. On les met à jour dans le même commit que le code.
6. **Git** : une branche par étape (`etape-3-either`, etc.), puis une PR vers `main`. Petits commits, messages clairs.

---

## Étape 0 — Installer l'environnement

**But** : pouvoir transpiler, compiler et comparer un projet sur ta machine.

**À faire** (une seule fois) :
1. Avoir WSL avec Ubuntu (`wsl --install -d Ubuntu` dans PowerShell si besoin).
2. Dans Ubuntu, installer Node 24, Go 1.27.4 et pnpm 12.18.0 :
   ```bash
   mkdir -p ~/.local/opt && cd ~/.local/opt
   curl -fsSL https://nodejs.org/dist/v24.13.1/node-v24.13.1-linux-x64.tar.xz | tar -xJ
   curl -fsSL https://go.dev/dl/go1.27.4.linux-amd64.tar.gz | tar -xz
   echo 'export PATH="$HOME/.local/opt/node-v24.13.1-linux-x64/bin:$HOME/.local/opt/go/bin:$PATH"' >> ~/.bashrc
   source ~/.bashrc
   npm i -g pnpm@12.18.0
   ```
3. Cloner le repo et installer les dépendances, **depuis Ubuntu** :
   ```bash
   git clone https://github.com/TizaouiKha/hackathon-11-2026.git
   cd hackathon-11-2026
   pnpm install
   ```

**Comment vérifier** : `./.commands/check.sh 00` affiche `✓ projet 00 : sortie identique à TypeScript`.

---

## Étape 1 — Projet 00 qui compile

✅ **Fait.** Le Go généré appelait `EitherSuccessOf` sans `[float64]`, ce qui ne compile pas en Go (bug B-01).
Correction dans `src/transpiler/transformers/duplojs/either/success/index.ts` : on lit le type de l'appel (`Success<number>`) via le checker, puis on génère `shard_dependencies.EitherSuccessOf[float64]`.

---

## Étape 2 — Script de vérification

✅ **Fait.** `./.commands/check.sh NN` (ou `pnpm check NN`) :
1. transpile `projects/NN` en Go ;
2. compile le Go (`go vet` + `go build`) ;
3. exécute le programme TypeScript d'origine et le programme Go ;
4. compare les deux sorties ligne par ligne.

C'est **l'outil de validation de toutes les étapes**. Si les sorties diffèrent, le script affiche un diff : `-` pour ce que TypeScript affiche, `+` pour ce que le Go affiche.

### Tests d'exécution : `pnpm test:runtime`

`check.sh` ne peut valider une brique que si un projet complet tourne. Or, au début, il manque encore `print`, `if`… Pour tester une brique **seule**, on écrit un test d'exécution :

```
tests/<nom>/
├── tsconfig.json   (copie de projects/00/tsconfig.json)
├── index.ts        (point d'entrée : importe au moins un fichier à tester)
├── xxx.ts          (le TypeScript à transpiler)
└── check/main.go   (programme Go écrit à la main : appelle le Go transpilé et vérifie les valeurs)
```

- `pnpm test:runtime` lance tous les tests, et `./.commands/test-runtime.sh either` un seul.
- Le script transpile le dossier, copie `check/` dans `dist/`, puis lance `go vet` et `go run ./check`.
- `check/main.go` importe le package transpilé (par exemple `shapes "duplojs.local/transpiled/shapes.ts"`) et appelle les fonctions sous leur nom Go (`shapes.Sourced_maFonction(...)`). Il doit **sortir avec un code d'erreur** si un contrôle échoue (`os.Exit(1)`).
- Exemple complet : `tests/either/` (étape 3), avec 21 contrôles.
- **Variante « générateur »** : si le dossier contient un `check.ts` (et pas de `check/main.go`), le script le lance seul avec `tsx`. Il génère et exécute lui-même son Go, ce qui permet de tester une **shared dependency** sans TypeScript à transpiler. Exemple : `tests/js-number-to-string/` imprime le helper Go tel que le transpileur le génère, puis le compare à `String(x)` de Node sur 2 034 nombres.

---

## Étape 3 — Représentation des `Either` en Go

> ✅ **Fait** sur la branche `etape-3-either`. Résumé de ce qui existe maintenant, pour les étapes 4 et 7 :
> - **Code** : `src/transpiler/transformers/duplojs/either/core/` :
>   - `sharedDependency.ts` : `EitherTag`, les tables, `Either[T]`, `Either2[R, L]` ;
>   - `tag.ts` : `registerEitherTag(context, side, information)` renvoie la constante `shard_dependencies.TagLeftXxx` ;
>   - `type.ts` : la règle `Either` / `Either2` ;
>   - `construct.ts` : `constructEither(...)` construit un littéral de struct du **type cible** (le type de retour de la fonction englobante, sinon le type contextuel, sinon le type propre de l'appel).
> - **Handlers** : `success/`, `fail/`, `left/` dans `either/`.
> - **Côté Go**, depuis un autre package :
>   - `r.Tag.IsRight()` renvoie un `bool` ;
>   - `r.Tag.Information()` renvoie le texte (par exemple `"negative-operand"`), utile pour `print` (étape 4) ;
>   - `r.Value` pour `Either`, `r.Right` / `r.Left` pour `Either2`.
> - **Vérifié** :
>   - `check.sh 00` ✓ ;
>   - **`tests/either/`** (`pnpm test:runtime`) : un `fail` dans une union explicite, un `success`, un `left` inféré, un littéral `0` élargi en `float64`, et `Either2` des deux côtés. Le Go est **exécuté**, et 21 contrôles vérifient `IsRight()`, `Information()`, les valeurs et l'unicité des tags ;
>   - lint et types OK.
> - **Pas encore vérifiable** : le `add` du projet 04 a besoin du transformer `if` (étape 6), et `Success<number[]>` (projet 09) a besoin des types tableau (étape 6).
>
> Le reste de cette section décrit ce qui a été demandé.

**But** : mettre en place en Go la représentation des `Either` **décidée en équipe** (D-09, ✅) : tag entier, `Either[T]` ou `Either2[R, L]`. C'est la fondation des projets 01 à 10.

**À lire avant** :
- `DECISIONS.md`, section **D-09** (le choix, la règle `Either` / `Either2`, les raisons) ;
- `src/transpiler/transformers/duplojs/either/success/sharedDependency.ts` (le type `EitherSuccess[T]` actuel, **à remplacer**) ;
- la sortie de référence du projet 04, dans `EXERCICES.md`, pour voir à quoi ressemble un `fail`.

**À faire** :
1. **Écrire le Go à la main d'abord**, dans un fichier de brouillon hors du repo :
   - `type EitherTag uint8`, les constantes (`TagSuccess`, `TagFail`, `TagNegativeOperand`, `TagDivisionByZero`), les tables `isRightTag[tag]` et `informationName[tag]`, et la méthode `String()` ;
   - `type Either[T any] struct { Tag EitherTag; Value T }` ;
   - `type Either2[R, L any] struct { Tag EitherTag; Right R; Left L }` ;
   - les constructeurs `EitherSuccessOf[T](v)`, `EitherFailOf[T]()`, `EitherLeftOf[T](tag, v)`.

   Vérifier que ça compile (`go build`).
2. **Générer les constantes de tag** : le transpileur doit rassembler toutes les informations utilisées dans le programme (`"success"`, `"fail"`, et chaque premier argument de `left(...)`), puis produire les constantes et les deux tables. `"success"` et `"fail"` sont toujours présents.
3. **Choisir `Either` ou `Either2` à partir d'un type TypeScript** : un transformer de type qui reçoit une union d'`Either` et applique la règle de D-09.2 avec le checker (types de chaque variante, `Fail` compatible avec tout).
4. Remplacer `EitherSuccess[T]` par ce type dans `success/`, puis créer les shared dependencies `fail/` et `left/` sur le même modèle.
5. **Conversion vers le type d'union** : quand une fonction a plusieurs `return`, chaque valeur doit avoir le type de retour de la fonction. Comme les variantes partagent la même struct, c'est direct (`Either[float64]{Tag: TagFail}`).

**Où** : `src/transpiler/transformers/duplojs/either/` (un dossier par opération).

**Attention** :
- `success` a un paramètre de type `const` : `success(1)` a le type `Success<1>`, pas `Success<number>`. Il faut **élargir** le type littéral vers `number` (le checker a de quoi le faire).
- Un `fail` a pour valeur `undefined`. Dans la struct, la valeur reste à zéro, et c'est le **tag** qui permettra à `print` d'afficher `undefined`.
- Il faut coordonner avec l'étape 4 (`print`) : `Inspect` doit savoir afficher un `Either` / `Either2` dans l'ordre de DuploJS (`right`/`left`, `information`, `value`, `success`/`fail`).

**Fini quand** : `./.commands/check.sh 00` passe toujours avec le nouveau type, et le Go généré pour `add` du projet 04 (avec `fail` et `success`) compile.

---

## Étape 4 — `print` fidèle à Node

> ✅ **Fait.** `src/transpiler/transformers/duplojs/common/print/` fournit `Inspect` / `Print` et le handler de `DCommon.print`. `Print` affiche puis retourne sa valeur comme l'API TypeScript. `tests/print/` vérifie les valeurs simples, les tableaux, les clés d'objet, les guillemets, l'Unicode, les nombres limites, les `Either` success/fail et les valeurs brutes `TagValue` pour `Either` et `Either2`. Les tests passent avec `bash .commands/test-runtime.sh print`.
>
> Cela valide la brique d'affichage, pas les projets 01 à 08 au complet : ils dépendent aussi d'autres étapes du transpileur.

> ⚠️ **À savoir depuis l'étape 7 (D-16)** : un Either dont le tag est `TagValue` est en fait une **valeur brute** (le résultat de `whenIsRight`). `print` doit alors afficher **seulement** sa valeur (`Value` pour `Either`, `Right` pour `Either2`), par exemple `[ 3 ]`, et **pas** l'objet DuploJS. On le détecte avec `x.Tag == shard_dependencies.TagValue`, ou `x.Tag.Information() == "value"`.

**But** : que `DCommon.print(x)` en Go affiche **exactement** la même chose que Node.

**Ce qu'il faut savoir** : `DCommon.print` appelle simplement `console.info(x)`. Node formate alors la valeur avec `util.inspect`, **pas en JSON**. Exemple réel, tiré du projet 01 :
```
{
  '@duplojs/lang/kind/@DuplojsLangEither/right': null,
  '@duplojs/lang/kind/@DuplojsLangEither/information': 'success',
  '@duplojs/lang/kind/@DuplojsLangEither/value': 3,
  '@duplojs/lang/kind/@DuplojsLangEither/success': null
}
```
Les règles à reproduire :
- clés et chaînes **entre guillemets simples** à l'intérieur des objets et tableaux (`[ '3' ]`) ;
- une chaîne affichée seule est écrite **sans guillemets** (`un opérande est négatif`) ;
- tableaux courts sur une ligne, avec des espaces : `[ 3 ]`, `[ '3', '3', 'échec' ]` ;
- objet sur plusieurs lignes (indentation de 2 espaces) **s'il ne tient pas sur 80 caractères**, sinon `{ a: 1 }` ;
- `null`, `undefined`, `true` et `false` en clair ;
- les nombres comme en JS : `3`, `-12`, `0.5`, jamais `3.000000`.

**À lire avant** :
- la règle exacte de retour à la ligne de Node (`reduceToSingleString` dans `lib/internal/util/inspect.js`, option `breakLength: 80`) ;
- `src/transpiler/sharedDependency/defaults/` (pour le format d'une dépendance par défaut).

**À faire** :
1. Écrire en Go une fonction `Inspect(v any) string` qui parcourt la valeur avec `reflect`. Elle utilise les **tags de struct** pour connaître le nom des clés (le code de départ met déjà les clés DuploJS dans des tags `json:"..."`).
2. Écrire `Print(v any)`, qui applique la règle de la chaîne seule et affiche le résultat.
3. Formatage des nombres : **déjà fait**. Réutiliser `shard_dependencies.JSNumberToString(f)` (D-12, `duplojs/string/to/sharedDependency.ts`). Il est identique à `String(x)` de Node, et testé sur 2 034 nombres. Il suffit d'enregistrer `jsNumberToStringDependency` avec `context.registerSharedDependency`.
4. En faire une shared dependency.
5. Tester avec des petits programmes Go qui affichent les sorties de référence de chaque projet (voir `EXERCICES.md`).

**Où** : `src/transpiler/transformers/duplojs/common/print/` (shared dependency + handler).

**Fini quand** : un programme Go écrit à la main affiche exactement les sorties de référence des projets 01, 02, 04 et 08.

---

## Étape 5 — Helper de préparation

**But** : ne plus recopier dans chaque transformer le motif « transformer l'enfant → vérifier l'erreur → créer une variable temporaire → concaténer `before` ». Il est déjà copié dans `binary.ts` et `call.ts`, et il va revenir partout.

**À lire avant** :
- D-06 dans `DECISIONS.md` ;
- `src/transpiler/transformers/expression/binary.ts` et `shared/call.ts` (le motif à extraire) ;
- `src/transpiler/context/build.ts` (où ajouter le helper).

**À faire** :
1. Ajouter dans `BuildContext` une méthode, par exemple `transformPrepared(node, transformers)`. Elle renvoie soit une erreur, soit `{ before, operand }`, où `operand` est l'expression Go à utiliser.
2. **Ne pas créer de variable temporaire** quand le résultat est déjà un identifiant ou un littéral : c'est inutile et ça rend le Go illisible. Aujourd'hui, `1 + 2` génère 4 temporaires.
3. Réécrire `binary.ts` et `call.ts` avec ce helper.
4. Vérifier que l'ordre d'évaluation reste le même : la fonction d'abord, puis les arguments de gauche à droite.

**Fini quand** : `./.commands/check.sh 00` passe toujours, et le Go de `add.ts.go` est plus court et lisible.

---

## Étape 6 — Transformers de base du langage

**But** : traduire les constructions TypeScript « normales » (hors DuploJS) utilisées dans les exercices.

**À lire avant** : étape 5 terminée, et la section « Inventaire des transformers » de `EXERCICES.md`.

**À faire** : un transformer par ligne, à tester au fur et à mesure.

| Construction TS | Go visé | Projets |
|---|---|---|
| `const x = expr` dans une fonction | `x := expr` | 01+ |
| `const x = expr` au niveau du module (D-07) | `var x T` au niveau du package, et `x = expr` dans `init()` | 01+ |
| `if (c) { … }` / `else` | `if c { … } else { … }` | 01, 04 |
| `===`, `!==`, `<`, `\|\|` | `==`, `!=`, `<`, `\|\|` (le mapping est déjà dans `binary.ts`, à tester) | 04, 06 |
| `"texte"` | littéral de chaîne Go | 06 |
| `c ? a : b` | `var t T; if c { t = a } else { t = b }`, placé dans `before` | 06 |
| `(x) => expr` | `func(x T) R { return expr }` | 05+ |
| `[a, b]` (tableau) | `[]T{a, b}` | 05 |
| `[number, number, number]` (tuple) | `[3]float64` | 08 |
| paramètre `([a, b, c]) =>` | paramètre `p [3]float64`, puis `a, b, c := p[0], p[1], p[2]` | 08 |
| `return` sans valeur | `return` | — |

**Où** : `src/transpiler/transformers/statement/`, `expression/` et `type/`, puis ajouter chaque transformer dans le `index.ts` de sa catégorie.

**Fini quand** : chaque construction a un transformer, et le Go produit pour les projets 01 à 08 ne bloque plus sur un `notfound-transformer` venant de ces constructions.

---

## Étape 7 — Domaine Either

> 🟨 **En partie fait** sur la branche `etape-7-either-helpers` (créée depuis `etape-3-either`).
>
> | Fonction | État | Go généré |
> |---|---|---|
> | `success`, `fail`, `left` | ✅ (étape 3) | littéral `Either[T]{Tag: …, Value: …}` |
> | `isRight(r)` | ✅ | `r.Tag.IsRight()` (méthode, pas de helper) |
> | `whenIsRightOtherwise(r, f, g)` | ✅ `Either` et `Either2` | `shard_dependencies.WhenIsRightOtherwise(r, f, g)` / `WhenIsRightOtherwise2` |
> | `matchInformation(r, {…})` | ✅ `Either` seulement | `shard_dependencies.MatchInformation(r, []func(T) U{TagX: f, …})` |
> | `rightPipe(r, f, g…)` | ✅ si chaque étape renvoie le même type d'Either | `RightThen(RightThen(r, f), g)` |
> | `whenIsRight(r, f)` | ✅ (D-16, `TagValue`) | `WhenIsRight(r, f, wrapValue, wrapLeft)` : la valeur brute est rangée avec `TagValue` |
> | `group([…])` | ⬜ attend les types tableau (étape 6) | `Group(rs)`, qui renvoie `Either2[[]T, T]` |
> | formes sans données (`whenIsRight(fn)`, `whenIsRightOtherwise(f, g)`, `matchInformation({…})`) | ✅ (étape 8a, D-17) | une fonction Go littérale qui appelle le helper |
>
> - **Callbacks** (`either/core/callback.ts`) : un callback TS qui déclare **moins** de paramètres que ce qu'il reçoit (`() => "échec"`) est enveloppé dans `func(_ T) U { return f() }`, car Go exige la signature exacte. Un callback qui déclare un paramètre plus précis que celui reçu n'est pas encore géré.
> - **Ajout lié à l'étape 6** : le type `boolean` devient `bool` (`type/bool.ts`), nécessaire pour renvoyer le résultat de `isRight`.
> - **Vérifié** : `tests/either-helpers/` (32 contrôles à l'exécution, dont 14 pour `whenIsRight`), `tests/either/`, `check.sh 00`, lint et types.
> - **Projets 01 à 07** : toujours bloqués par l'étape 6 (`const`, `if`, fonctions fléchées, chaînes) et l'étape 4/8 (`print`).

**But** : traduire chaque fonction `DEither.*` utilisée dans les exercices.

**À lire avant** :
- étape 3 terminée ;
- le skill `typescript-to-go`, section « routeur puis handler » ;
- le routeur existant : `src/transpiler/transformers/duplojs/either/index.ts`.

**À faire** : ajouter un `DPattern.match` dans le routeur, et un dossier handler par fonction.
Chaque fonction devient un **helper Go générique écrit une fois à la main** (D-09.3), livré comme shared dependency. Le handler génère seulement l'appel à ce helper.

| Fonction TS | Helper Go à écrire (shared dependency) | Appel généré | Projets |
|---|---|---|---|
| `fail()` | `EitherFailOf[T]() Either[T]` | `EitherFailOf[float64]()` | 04 |
| `left(info, v)` | `EitherLeftOf[T](tag, v) Either[T]` | `EitherLeftOf(TagNegativeOperand, v)` | 06 |
| `isRight(r)` | `IsRight[T](r Either[T]) bool` (lit `isRightTag[r.Tag]`) | `IsRight(r)` | 01 |
| `whenIsRight(r, f)` | `WhenIsRight[T, U](r, f func(T) U) Either[U]` | `WhenIsRight(r, f)` | 02, 03 |
| `whenIsRightOtherwise(r, f, g)` | `WhenIsRightOtherwise[T, U](r, f, g func() U) U` | `WhenIsRightOtherwise(r, f, g)` | 05+ |
| `matchInformation(r, { … })` | `MatchInformation[T, U](r, handlers []func(T) U) U`, avec les handlers **rangés par numéro de tag** (un slice : pas de map, plus rapide) | `MatchInformation(r, []func(float64) string{…})` | 06, 07 |
| `rightPipe(r, f, g…)` | `RightThen[T, U](r Either[T], f func(T) Either[U]) Either[U]`, à **deux** arguments (Go n'a pas de génériques variadiques) | `RightThen(RightThen(r, f), g)` : appels emboîtés | 07, 08 |
| `group([…])` | `Group[T](rs []Either[T]) Either2[[]T, T]`, qui s'arrête au premier `left` | `Group(calculations)` | 09 |
| types `Fail`, `Left<…>`, unions | — | `Either[T]` ou `Either2[R, L]` selon la règle de D-09.2 (étape 3) | 01, 04, 09 |

**Conseil** : écrire et tester chaque helper dans un petit programme Go à part (`go run`) **avant** d'écrire le handler qui génère son appel.

**Attention** : les formes **sans données** (`DEither.whenIsRight(fn)`, utilisée dans un `pipe` ou un `map`) se traduisent avec l'étape 8. Le `pipe` fournit la donnée.

**Fini quand** : les projets 01, 02, 04, 06 et 07 n'échouent plus sur une fonction `DEither`.

---

## Étape 8 — Domaines Common / Array / String

> 🟨 **Découpée en deux.**
>
> **8a — fait** (branche `etape-8a-pipe`, sans dépendre des étapes 4 et 6) :
> - **`DCommon.pipe`** est déroulé à la compilation (D-10) ;
> - les **formes curryfiées** `DEither.whenIsRight(f)`, `whenIsRightOtherwise(f, g)` et `matchInformation({…})` deviennent des fonctions Go (D-17) ;
> - **le routeur `duplojs/common/`** est créé. ⚠️ **Pour la personne de l'étape 4** : `print` doit s'y brancher. Il suffit d'ajouter un `DPattern.match(DCommon.equal("print"), …)` dans `src/transpiler/transformers/duplojs/common/index.ts` et le handler dans `common/print/`. Ne pas créer un second routeur ;
> - **vérifié** : `tests/pipe/` (15 contrôles, valeurs calculées avec le vrai DuploJS), et tous les autres tests.
>
> **8b — en cours** :
> - ✅ **`DString.to`** (branche `etape-8b-dstring-to`, D-12) :
>   - le helper Go `JSNumberToString` est identique à `String(x)` de Node (2 034 nombres testés) ;
>   - le routeur `duplojs/string/` est créé ;
>   - les formes appelée et passée comme fonction sont traduites ;
>   - `tests/dstring-to/` vérifie `DString.to(a) === DString.to(b)` de bout en bout.
>
>   Reste à vérifier quand le type `string` de l'étape 6 existera : une fonction qui **renvoie** le texte, et la forme passée à `map` ou `whenIsRightOtherwise`.
> - ⬜ `DCommon.print` : brancher le `Inspect` de l'étape 4 ;
> - ⬜ `DArray.map` et `DArray.coalescing` : ils ont besoin des types tableau (`number[]`) et des fonctions fléchées (étape 6). La forme curryfiée de `map` suivra le modèle de D-17 (`either/core/operand.ts`).

**But** : traduire `pipe`, `print`, `DArray.map`, `DArray.coalescing` et `DString.to`.

**À lire avant** :
- étapes 4 et 5 ;
- D-10 (pipe déroulé) et D-12 (nombres) ;
- le routeur Either, comme modèle pour créer les routeurs `common/`, `array/` et `string/`.

**À faire** :

| Fonction | Traduction visée | Projets |
|---|---|---|
| `DCommon.print(x)` | `Print(x)` de l'étape 4 | 01+ |
| `DCommon.pipe(x, f, g)` | `t1 := f(x)`, puis `t2 := g(t1)`, déroulé à la compilation | 03+ |
| `DArray.map(xs, f)` | boucle `for range` sur un slice pré-alloué `make([]R, 0, len(xs))` | 05, 08 |
| `DArray.map(f)` (sans données, dans un pipe) | même chose, avec la donnée fournie par le pipe | 05, 08 |
| `DArray.coalescing(x)` | `[]T{x}` si `x` n'est pas déjà un tableau (vérifier la source DuploJS) | 02+ |
| `DString.to(n)` | formatage de nombre fidèle à JS | 05+ |

**Fini quand** : les projets 02, 03, 05 et 08 n'échouent plus sur ces fonctions.

---

## Étape 9 — Valider les projets 01 → 09

**But** : que chaque projet affiche exactement la même chose qu'en TypeScript.

**À faire** :
1. Pour chaque projet, **dans l'ordre**, lancer `./.commands/check.sh NN`.
2. Si ça échoue, lire le message :
   - `notfound-transformer` : il manque un transformer, regarder `kind` et `text` dans l'erreur ;
   - `le Go généré ne compile pas` : lire l'erreur de `go build` ;
   - diff de sortie : regarder les lignes `-` (attendu) et `+` (obtenu).
3. Corriger, puis relancer **tous les projets précédents** pour ne rien casser.
4. Remplir la section « Go visé » du projet dans `EXERCICES.md` avec le Go obtenu, et passer son état à ✅.

**Fini quand** : `for n in 01 02 03 04 05 06 07 08 09; do ./.commands/check.sh $n || break; done` passe en entier.

---

## Étape 10 — Projet 10 (asynchrone)

**But** : traduire `async` / `await` / `Promise`, `rightAsyncPipe`, `asyncGroup` et `asyncPipe`.

**Approche choisie (D-11)** : exécution **synchrone**. `async` et `await` disparaissent, `Promise<T>` devient `T`, et les fonctions `async*` se traduisent comme leurs versions synchrones (étapes 7 et 8). Il n'y a pas de vraie entrée/sortie, donc la sortie reste identique.

**Bonus, si on a le temps** : des goroutines et un `sync.WaitGroup` pour `asyncGroup`, avec un benchmark à l'appui.

**Fini quand** : `./.commands/check.sh 10` passe.

---

## Étape 11 — Performance et finitions

**But** : montrer au jury que le Go produit est **pertinent et performant**, comme le demande le cours « Stratégies ».

**À faire** :
1. `go build -gcflags=-m ./...` dans un `dist/` : repérer les valeurs allouées sur le tas (`escapes to heap`) et les supprimer quand c'est possible.
2. Écrire un benchmark (`go test -bench`) qui compare notre représentation des `Either` (tag entier, D-09.1) à une version `interface{}` / `any` et à une version avec l'information en chaîne, pour justifier D-09 avec des chiffres.
3. **Dérouler à la compilation les helpers qui coûtent** (D-09.3) : seulement ceux que `-gcflags=-m` ou le benchmark désignent (probablement `IsRight`, et les closures de `WhenIsRight` si elles sont allouées sur le tas). Mesurer avant et après.
4. Rendre les noms de package lisibles (bug B-02) : utiliser le chemin relatif, pas le chemin absolu.
5. Relire le Go généré des projets : supprimer les temporaires inutiles et les conversions redondantes.
6. Résumer les chiffres et les choix dans `DECISIONS.md`, pour la présentation.
