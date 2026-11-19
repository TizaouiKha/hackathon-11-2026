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
| 3 | [Représentation des `Either` en Go](#étape-3--représentation-des-either-en-go) | — | Claude | ✅, puis remplacée par `EitherAny` (D-18) |
| 3b | [Couche de traduction des types (D-18)](#étape-3b--couche-de-traduction-des-types-d-18) | 3 | Claude | ✅ phases 1 à 4 + D-18.5 (mergées) |
| 4 | [`print` fidèle à Node (`util.inspect`)](#étape-4--print-fidèle-à-node) | — | Wilbour | ✅ |
| 5 | [Helper de préparation](#étape-5--helper-de-préparation) | — | Yacine | ✅ (mergée, PR #11) |
| 6 | [Transformers de base du langage](#étape-6--transformers-de-base-du-langage) | 5 | Wilbour | ✅ (PR #14) |
| 7 | [Domaine Either (handlers)](#étape-7--domaine-either) | 3, 5 | Claude, puis Mrlbe1 | ✅ (`group` : PR #15) |
| 8 | [Domaines Common / Array / String](#étape-8--domaines-common--array--string) | 4, 5 | Claude | ✅ 8a (`pipe`, formes curryfiées), 8b (`DString.*`, `DArray.map`, `DArray.coalescing`, D-18.4 et D-18.5) ; `print` fait à l'étape 4 |
| 9 | [Valider les projets 01 → 09](#étape-9--valider-les-projets-01--09) | 6, 7, 8 | tout le monde | ✅ les 10 projets (00 à 09) passent |
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
3. **Pour construire du Go**, utilise les factories existantes `GoAST.create...` (dans `src/go/ast/`). N'en écris pas de nouvelles sauf si un nœud manque vraiment.
   **Pour un type**, ne traduis jamais un type TS à la main : appelle `tsTypeToGo` (`src/transpiler/transformers/type/tsTypeToGo.ts`, D-18). C'est le **seul** endroit qui décide du type Go (`number` → `float64`, tuple → slice, objet → struct anonyme…). Le Go produit par un transformer doit avoir le type Go du type TS de son expression : l'adaptateur (`expression/adapt.ts`) s'en sert pour insérer les assertions au narrowing.
4. **Une étape est finie quand** :
   - `./.commands/check.sh NN` affiche ✓ pour les projets concernés ;
   - `pnpm test:runtime` passe (tests d'exécution de `tests/`, voir l'étape 2) ;
   - `pnpm test:types` et `pnpm test:lint` passent.

   Quand une étape ne peut pas encore être validée par un projet complet (par exemple parce qu'il manque `print`), **ajoute un test d'exécution** dans `tests/<nom>/` pour prouver que ton code marche.
5. **On note tout** : un choix dans `DECISIONS.md`, l'avancement et le Go obtenu dans `EXERCICES.md`. On les met à jour dans le même commit que le code.
6. **Git** : une branche par étape (`etape-3-either`, etc.), puis une PR vers `main` **du fork** `TizaouiKha/hackathon-11-2026` (pas vers `duplojs/hackathon-11-2026`, D-15). Petits commits, messages clairs. Si `main` a avancé pendant ton travail, merge `main` dans ta branche et **relance toute la suite** avant de demander le merge.

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
Correction d'origine dans `src/transpiler/transformers/duplojs/either/success/index.ts`. Depuis D-18, `EitherSuccessOf` n'existe plus : `DEither.success(x)` devient directement le littéral `EitherAny{Tag: TagRightSuccess, Value: x}`.

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
- Exemple complet : `tests/either/` (étape 3). Liste actuelle (17 tests) : `arrays`, `composite-types`, `dstring-to`, `either`, `either-helpers`, `js-number-to-string`, `js-operators`, `language-basics`, `language-extended`, `maps-advanced`, `narrowing`, `pipe`, `preparation`, `print`, `strings`, `ts-types`, `type-declarations`.
- **Valeurs attendues** : calcule-les en exécutant **le même TypeScript avec `tsx`**, ne les écris pas de tête. Pour beaucoup de cas, génère `check/cases.go` depuis Node (exemple : `tests/strings/generate.ts`, 6 438 cas). Pour un affichage, compare `shard.Inspect(x)` à `util.inspect(x)` de Node (exemple : `tests/maps-advanced/`).
- **Piège** : dans `check/main.go`, une constante Go rangée dans un `any` garde son type par défaut (`Value: 2` est un `int`). Le Go transpilé lit un `float64` : écris `float64(2)`.
- **Variante « générateur »** : si le dossier contient un `check.ts` (et pas de `check/main.go`), le script le lance seul avec `tsx`. Il génère et exécute lui-même son Go, ce qui permet de tester une **shared dependency** sans TypeScript à transpiler. Exemple : `tests/js-number-to-string/` imprime le helper Go tel que le transpileur le génère, puis le compare à `String(x)` de Node sur 2 034 nombres.

---

## Étape 3 — Représentation des `Either` en Go

> ✅ **Fait, puis remplacé par D-18** (voir l'étape 3b). `Either[T]`, `Either2[R, L]`, `type.ts` et la règle « par côté » **n'existent plus**. Ce qui reste de l'étape 3 : le **tag entier** (`EitherTag uint8`, D-09.1) et `TagValue` (D-16).
>
> **Ce qui existe aujourd'hui** (`src/transpiler/transformers/duplojs/either/core/`) :
> - `sharedDependency.ts` : `EitherTag`, les tables `[256]` (`eitherTagIsRight`, `eitherTagIsLeft`, `eitherTagInformation`) et **un seul type** pour toutes les unions d'Either, quel que soit le nombre d'issues :
>   ```go
>   type EitherAny struct { Tag EitherTag; Value any }
>   ```
> - `tag.ts` : `registerEitherTag(context, side, information)` renvoie la constante `shard_dependencies.TagLeftXxx` (ou `TagValue` pour une valeur brute) ;
> - `issues.ts` : lit les issues d'une union (`Success`, `Fail`, `Error`, `Left`, `Right`, et les valeurs brutes) sur le `Type` du checker ;
> - `construct.ts` : `EitherAny{Tag: …, Value: …}` pour `success`, `fail`, `left`, `right`, `error`.
>
> **Côté Go**, depuis un autre package : `r.Tag.IsRight()`, `r.Tag.IsLeft()`, `r.Tag.Information()` (par exemple `"negative-operand"`) et `r.Value.(float64)` : la valeur s'ouvre par **assertion**, avec le type que TypeScript connaît.
>
> **Vérifié** : `tests/either/`, `tests/ts-types/` (les issues du code du prof affichées comme dans Node), `check.sh 00`.
>
> Le reste de cette section décrit ce qui avait été demandé à l'origine ; il est **historique**.

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

## Étape 3b — Couche de traduction des types (D-18)

> ✅ **Fait** (PR #7 à #10 et #12, mergées). Détail et raisons : `DECISIONS.md`, D-18.1 à D-18.5. **À connaître avant d'écrire un transformer** (étapes 6 et 7).

**Le principe** : TypeScript a déjà vérifié et calculé tous les types (narrowing, `Extract`, `ReturnType`…). Go ne comprend rien de tout ça. Un **seul** endroit traduit un type du checker en type Go : `tsTypeToGo` (`transformers/type/tsTypeToGo.ts`).

| TypeScript | Go |
|---|---|
| `number`, littéral, `number & Marque` | `float64` |
| `string`, littéral, `string & Marque` | `string` |
| `boolean` | `bool` |
| `null` / `undefined`, `void` | `JSNull` / `JSUndefined` (marqueurs de taille nulle) |
| union contenant un `Either` DuploJS | `EitherAny` |
| union de valeurs brutes (`string \| number`), `any`, `unknown` | `any` |
| `T[]`, `readonly T[]`, tuple `[A, A]` | `[]A` |
| tuple hétérogène `[A, B]` | `[]any` (chaque élément lu par assertion) |
| objet `{ name: string }` | `struct{ Sourced_name string \`json:"name"\` }` (anonyme ; le tag sert à `print`) |
| `Record<string, T>` | `map[string]T` |
| fonction `(a: A) => R` | `func(A) R` (`void` : pas de retour) |
| `Promise<T>` | `T` (D-11) |
| paramètre de type `T` | sa contrainte si elle est traduisible (`T extends string` → `string`), sinon `any` |
| type récursif, `Map` JS, fonction surchargée | erreur claire (`…-not-supported-yet`) |

**Les helpers à réutiliser** :
- `tsTypeToGo(type, node, context)` / `tsTypeOfNodeToGo(node, context)` ;
- `expression/adapt.ts` : à chaque expression, compare le type **produit** (déclaré pour une variable), **rétréci** (narrowing) et **attendu** (contexte), puis insère `x.Value.(T)`, `x.(T)` ou l'élargissement `EitherAny{Tag: TagValue, Value: x}`. Rien à faire dans ton transformer, à condition de **produire le Go du type TS** de ton expression ;
- `either/core/callback.ts` (`transformCallback`) : adapte une fonction passée à un helper (moins de paramètres, `any` à ouvrir, fonction générique) ;
- `either/core/operand.ts` (`translateWithData`, `translateCurried`, `translateFunctionValue`) : formes avec données, curryfiée, et passée comme fonction.

**Limite connue** : la lecture après narrowing (`if (isLeft(x)) return x;` puis `x` utilisé comme `string`) est écrite mais **jamais testée**, faute de `if`. ⚠️ **À tester dès que l'étape 6 apporte `if`** (D-18.2).

---

## Étape 4 — `print` fidèle à Node

> ✅ **Fait.** `src/transpiler/transformers/duplojs/common/print/` fournit `Inspect` / `Print` et le handler de `DCommon.print`. `Print` affiche puis retourne sa valeur comme l'API TypeScript. `tests/print/` vérifie les valeurs simples, les tableaux, les clés d'objet, les guillemets, l'Unicode, les nombres limites, les `Either` success/fail et les valeurs brutes `TagValue` (à l'origine pour `Either` et `Either2`, aujourd'hui pour `EitherAny`). Les tests passent avec `bash .commands/test-runtime.sh print`.
>
> Cela valide la brique d'affichage, pas les projets 01 à 08 au complet : ils dépendent aussi d'autres étapes du transpileur.

> **Depuis D-18** :
> - `print` lit `EitherAny` (sa `Value` par réflexion). La 4ᵉ clé (`…/success: null`) n'est affichée que pour `success`, `error` et `fail`, comme dans Node ;
> - un `EitherAny` dont le tag est `TagValue` est une **valeur brute** (le résultat de `whenIsRight`, D-16) : `print` affiche **seulement** sa `Value` (par exemple `[ 3 ]`) ;
> - un objet s'affiche avec ses noms TS grâce au tag `json:"name"` que met `tsTypeToGo` (D-18.5), et non avec `Sourced_name`.

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

> ✅ **Fait et mergé** (PR #11). `context.transformPrepared(node, transformers)` conserve les instructions de préparation et laisse les identifiants et les littéraux en place quand c'est possible. Les 4 corrections de la review R-01 sont incluses (`%` → `math.Mod`, opérateurs bit à bit en int32 comme JS, `1e400` → `math.Inf(1)`, `&&`/`||` entre nombres). Tests : `tests/preparation/`, `tests/js-operators/`.
>
> ⚠️ **Reste ouvert pour l'étape 6** (R-01, remarque n° 2) : l'ordre d'évaluation avec des variables. Dans `f(x, change())`, si `change()` modifie `x`, il faut copier `x` **avant** d'évaluer `change()`. Ce n'est pas déclenchable aujourd'hui, mais ça le devient dès qu'il y a des affectations.

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

> ✅ **Fait** : variables locales et module, `if`/`else`, retours vides, chaînes,
> unaires, parenthèses, ternaires, fonctions fléchées, tableaux, tuples et
> paramètres tuple déstructurés (Wilbour, PR #14). `tests/language-basics/` vérifie
> 32 comportements à l'exécution. Après le merge avec `main` (`DArray`, D-18) :
> **les projets 00 à 08 passent tous**, sortie identique à TypeScript. Une
> déstructuration d'un tuple hétérogène (`[]any` depuis D-18.5) ouvre chaque
> élément par assertion (`p[1].(float64)`).

**But** : traduire les constructions TypeScript « normales » (hors DuploJS) utilisées dans les exercices.

**À lire avant** : étape 5 terminée, **l'étape 3b** (`tsTypeToGo`, l'adaptateur, `transformCallback`), et la section « Inventaire des transformers » de `EXERCICES.md`.

**État mesuré** (19/11, après les PR #14 et #15) : `check.sh` passe pour les projets **00 à 09**. Le 10 attend l'asynchrone (`rightAsyncPipe`, étapes 7 et 10).

**À faire** : un transformer par ligne, à tester au fur et à mesure. **Les types Go viennent toujours de `tsTypeToGo`**, jamais d'une règle écrite dans ton transformer.

| Construction TS | Go visé | Projets | État |
|---|---|---|---|
| `const x = expr` dans une fonction | `x := expr` | 01+ | ✅ |
| `const x = expr` au niveau du module (D-07) | `var x T` au niveau du package, et `x = expr` dans `init()` | 01+ | ✅ |
| `if (c) { … }` / `else` | `if c { … } else { … }` | 01, 04 | ✅ |
| `===`, `!==`, `<`, `\|\|`, `&&` | `==`, `!=`, `<`, `\|\|`, `&&` | 04+ | ✅ fait à l'étape 5 (`binary.ts`) |
| `-x` (moins unaire), `!x` | `-x`, `!x` | 04 (`add(-1, 2)`), 05 à 07 (`[-12]`) | ✅ (`+x`, `-x`, `!x`, `~x`) |
| `"texte"` | littéral de chaîne Go | 06+ | ✅ |
| `c ? a : b` | `var t T; if c { t = a } else { t = b }`, placé dans `before` | 06+ | ✅ |
| `(x) => expr` | `func(x T) R { return expr }` ; types des paramètres et du retour lus par le checker (`tsTypeToGo`) | 05+ | ✅ |
| `[a, b]` (tableau ou tuple) | `[]T{a, b}` ; `[]any{a, b}` si les éléments ont des types Go différents | 05+ | ✅ |
| tuple `[number, number, number]` | **`[]float64`** (une slice, D-18.5) : **pas** `[3]float64` | 08, 09 | ✅ type déjà traduit |
| paramètre `([a, b, c]) =>` | paramètre `p []float64`, puis `a, b, c := p[0], p[1], p[2]` | 08, 09 | ✅ |
| `obj.name` (accès à une propriété) | `obj.Sourced_name` ; sur un `any` (tuple hétérogène, `EitherAny.Value`), l'adaptateur ajoute l'assertion | — | ✅ (D-19) |
| `type X = …`, `interface X { … }` | **rien** : Go n'en a pas besoin, le checker lit déjà les types | — | ✅ au niveau du fichier (D-18.6) et dans une fonction (D-19) |
| `return` sans valeur | `return` | — | ✅ |

**Au-delà des exercices (D-19)** : objets littéraux, accès aux éléments, affectations, `for…of`, `while`, `for`, `break` / `continue`, `switch`, template strings, `typeof`, `??`, `Math.*`, déstructuration d'objet et `group` sur un objet sont traduits et vérifiés contre Node (`tests/language-extended/`, 86 cas).

**Ensuite, deux vérifications obligatoires** :
1. **Ordre d'évaluation avec des variables** (R-01, remarque n° 2, voir l'étape 5) : à corriger dès que les affectations existent.
2. ~~**Lecture après narrowing** (D-18.2)~~ : ✅ vérifiée à l'exécution (`tests/language-extended/`, D-19).

**Où** : `src/transpiler/transformers/statement/`, `expression/` et `declaration/`, puis ajouter chaque transformer dans le `index.ts` de sa catégorie.

**Fini quand** : chaque construction a un transformer, et le Go produit pour les projets 01 à 08 ne bloque plus sur un `notfound-transformer` venant de ces constructions.

---

## Étape 7 — Domaine Either

> 🟨 **Tout est fait sauf `group`** (mergé dans `main`, réécrit sur `EitherAny` par D-18).
>
> | Fonction | État | Go généré |
> |---|---|---|
> | `success`, `fail`, `left`, `right`, `error` | ✅ | littéral `EitherAny{Tag: …, Value: …}` |
> | `isRight(r)` / `isLeft(r)` | ✅ | `r.Tag.IsRight()` / `r.Tag.IsLeft()` (méthodes, pas de helper) |
> | `unwrapRight(r)` | ✅ (D-18.2) | `r.Value.(T)`, `r.Value` ou `UnwrapRight(r)` selon le type du résultat |
> | `whenIsRightOtherwise(r, f, g)` | ✅ | `WhenIsRightOtherwise[T, U](r EitherAny, onRight func(T) U, otherwise func(EitherAny) U) U` |
> | `matchInformation(r, {…})` | ✅ issues de types différents | `MatchInformation[U](r, []func(any) U{…})`, handlers rangés par numéro de tag |
> | `rightPipe(r, f, g…)` | ✅ étapes de types différents, ou qui renvoient une valeur brute | `RightThen(RightThen(r, f), g)` |
> | `whenIsRight(r, f)` | ✅ (D-16, `TagValue`) | `WhenIsRight[T, V](r, f) EitherAny` ; si `f` renvoie un Either : `RightThen` |
> | formes sans données (`whenIsRight(fn)`, `whenIsRightOtherwise(f, g)`, `matchInformation({…})`) | ✅ (D-17) | une fonction Go littérale qui appelle le helper |
> | `group([…])` | ✅ (PR #15) | `Group[T](rs)` : renvoie un `EitherAny`, avec le premier échec ou la slice `[]T` des valeurs |
> | `rightAsyncPipe`, `asyncGroup` | ⬜ projet 10 (étape 10) | comme leurs versions synchrones (D-11) |
>
> - **Callbacks** (`either/core/callback.ts`) : un callback qui déclare moins de paramètres est enveloppé ; un `any` reçu est ouvert par assertion ; une fonction DuploJS générique passée en valeur est typée par le contexte, une fonction générique du projet par sa déclaration (D-18.5).
> - **Vérifié** : `tests/either/`, `tests/either-helpers/`, `tests/narrowing/`, `tests/pipe/`, `tests/maps-advanced/` (les deux `map` du projet 08), `check.sh 00`, lint et types.

**But** : traduire chaque fonction `DEither.*` utilisée dans les exercices.

**À lire avant** :
- étape 3 terminée ;
- le skill `typescript-to-go`, section « routeur puis handler » ;
- le routeur existant : `src/transpiler/transformers/duplojs/either/index.ts`.

**À faire** : ajouter un `DPattern.match` dans le routeur, et un dossier handler par fonction.
Chaque fonction devient un **helper Go générique écrit une fois à la main** (D-09.3), livré comme shared dependency. Le handler génère seulement l'appel à ce helper.

> ⚠️ Le tableau ci-dessous est **historique** (plan d'avant D-18) : les signatures `Either[T]` / `Either2[R, L]` ne sont plus valables. Les signatures actuelles sont dans le tableau d'état ci-dessus, et toutes prennent un `EitherAny`.

| Fonction TS | Helper Go à écrire (shared dependency) | Appel généré | Projets |
|---|---|---|---|
| `fail()` | `EitherFailOf[T]() Either[T]` | `EitherFailOf[float64]()` | 04 |
| `left(info, v)` | `EitherLeftOf[T](tag, v) Either[T]` | `EitherLeftOf(TagNegativeOperand, v)` | 06 |
| `isRight(r)` | `IsRight[T](r Either[T]) bool` (lit `isRightTag[r.Tag]`) | `IsRight(r)` | 01 |
| `whenIsRight(r, f)` | `WhenIsRight[T, U](r, f func(T) U) Either[U]` | `WhenIsRight(r, f)` | 02, 03 |
| `whenIsRightOtherwise(r, f, g)` | `WhenIsRightOtherwise[T, U](r, f, g func() U) U` | `WhenIsRightOtherwise(r, f, g)` | 05+ |
| `matchInformation(r, { … })` | `MatchInformation[T, U](r, handlers []func(T) U) U`, avec les handlers **rangés par numéro de tag** (un slice : pas de map, plus rapide) | `MatchInformation(r, []func(float64) string{…})` | 06, 07 |
| `rightPipe(r, f, g…)` | `RightThen[T, U](r Either[T], f func(T) Either[U]) Either[U]`, à **deux** arguments (Go n'a pas de génériques variadiques) | `RightThen(RightThen(r, f), g)` : appels emboîtés | 07, 08 |
| `group([...])` | termine : handler et helper Go generique ajoutes | `Group[T](rs)`, renvoie EitherAny avec le premier echec ou []T | 09 |
| types `Fail`, `Left<…>`, unions | — | `Either[T]` ou `Either2[R, L]` selon la règle de D-09.2 (étape 3) | 01, 04, 09 |

**Conseil** : écrire et tester chaque helper dans un petit programme Go à part (`go run`) **avant** d'écrire le handler qui génère son appel.

**Attention** : les formes **sans données** (`DEither.whenIsRight(fn)`, utilisée dans un `pipe` ou un `map`) se traduisent avec l'étape 8. Le `pipe` fournit la donnée.

**Fini** : les handlers Either sont presents, y compris `group`. Validation des projets dependants apres les transformers de letape 6.

---

## Étape 8 — Domaines Common / Array / String

> ✅ **Faite** (8a et 8b mergées).
>
> **8a — fait** (branche `etape-8a-pipe`, sans dépendre des étapes 4 et 6) :
> - **`DCommon.pipe`** est déroulé à la compilation (D-10) ;
> - les **formes curryfiées** `DEither.whenIsRight(f)`, `whenIsRightOtherwise(f, g)` et `matchInformation({…})` deviennent des fonctions Go (D-17) ;
> - **le routeur `duplojs/common/`** est créé. ⚠️ **Pour la personne de l'étape 4** : `print` doit s'y brancher. Il suffit d'ajouter un `DPattern.match(DCommon.equal("print"), …)` dans `src/transpiler/transformers/duplojs/common/index.ts` et le handler dans `common/print/`. Ne pas créer un second routeur ;
> - **vérifié** : `tests/pipe/` (15 contrôles, valeurs calculées avec le vrai DuploJS), et tous les autres tests.
>
> **8b — fait** :
> - ✅ **`DString.to`** (branche `etape-8b-dstring-to`, D-12) :
>   - le helper Go `JSNumberToString` est identique à `String(x)` de Node (2 034 nombres testés) ;
>   - le routeur `duplojs/string/` est créé ;
>   - les formes appelée et passée comme fonction sont traduites ;
>   - passée à `map` et à `whenIsRightOtherwise`, et renvoyée par une fonction : vérifié (`tests/arrays/`, `tests/maps-advanced/`).
> - ✅ **11 autres fonctions `DString`** (D-18.4) : `length`, `slice`, `substring`, `charAt`, `at`, `indexOf`, `includes`, `startsWith`, `endsWith`, `toUpperCase`, `toLowerCase`, avec la sémantique UTF-16 de JavaScript (`tests/strings/`, 6 438 cas générés depuis Node) ;
> - ✅ `DCommon.print` : branché à l'étape 4 ;
> - ✅ `DArray.map` et `DArray.coalescing` (branche `etape-8b-darray`, D-18.5) : formes avec données, curryfiée et passée comme fonction ; `coalescing` décidé à la compilation d'après le type TS. Les tests passent les tableaux depuis Go en attendant les littéraux `[…]` de l'étape 6.

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
| `DArray.map(xs, f)` | helper `Map[T, U]` : boucle `for range`, slice de sortie allouée une fois à sa taille (D-18.5) | 05, 08 |
| `DArray.map(f)` (sans données, dans un pipe) | même chose, avec la donnée fournie par le pipe | 05, 08 |
| `DArray.coalescing(x)` | décidé à la compilation : `x` si c'est un tableau, sinon `[]T{x}` (D-18.5) | 02+ |
| `DString.to(n)` | formatage de nombre fidèle à JS | 05+ |

**Fini quand** : les projets 02, 03, 05 et 08 n'échouent plus sur ces fonctions. ✅ Vérifié sur leurs formes exactes (`tests/arrays/`, `tests/maps-advanced/`). Les projets eux-mêmes attendent encore l'étape 6.

**Pas encore traduit** (aucun projet ne s'en sert) : `DString.split`, `replace`, `test` (la syntaxe des regex Go diffère de celle de JS), `padStart`… et les autres fonctions `DArray`. Le handler générique `duplojs/string/core/stringFunction.ts` et le modèle de `duplojs/array/map/` servent de base pour les ajouter.

---

## Étape 9 — Valider les projets 01 → 09

> ✅ **Faite** (19/11, après les PR #14 et #15). `./.commands/check.sh NN` passe pour **les 10 projets, de 00 à 09** : transpilation, compilation Go, puis sortie **identique** à celle de TypeScript. Le Go obtenu pour chaque projet est dans `EXERCICES.md`.

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

> ✅ **Faite** : `async` et `await` sont effacés, `rightAsyncPipe` réutilise la
> propagation de `rightPipe`, `asyncPipe` est déroulé comme `pipe`, et
> `asyncGroup` exécute ses fonctions séquentiellement en s'arrêtant au premier
> `Left`. `tests/async/` couvre 20 comportements et `check.sh 10` passe avec une
> sortie identique à TypeScript.
>
**But** : traduire `async` / `await` / `Promise`, `rightAsyncPipe`, `asyncGroup` et `asyncPipe`.

**Approche choisie (D-11)** : exécution **synchrone**. `async` et `await` disparaissent, `Promise<T>` devient `T`, et les fonctions `async*` se traduisent comme leurs versions synchrones (étapes 7 et 8). Il n'y a pas de vraie entrée/sortie, donc la sortie reste identique.

**Implémentation** : le type `Promise<T>` devient `T` dans `tsTypeToGo` (D-18.3),
le transformer `await` conserve seulement son expression, et les trois fonctions
DuploJS possèdent des handlers dédiés. Le helper Go `AsyncGroup[E, T]` reçoit une
slice de getters ou de valeurs `Either`, conserve l'ordre, ouvre les valeurs avec
le type fourni par le checker et renvoie immédiatement le premier `Left`. Les
littéraux, les tableaux stockés homogènes ou mixtes et les objets littéraux sont
gérés. Pour un objet, un second helper générique conserve les clés dans un struct
Go typé et applique un assignateur propre à chaque champ.

**Bonus, si on a le temps** : des goroutines et un `sync.WaitGroup` pour `asyncGroup`, avec un benchmark à l'appui.

**Fini quand** : `./.commands/check.sh 10` passe.

---

## Étape 11 — Performance et finitions

**But** : montrer au jury que le Go produit est **pertinent et performant**, comme le demande le cours « Stratégies ».

**À faire** :
1. `go build -gcflags=-m ./...` dans un `dist/` : repérer les valeurs allouées sur le tas (`escapes to heap`) et les supprimer quand c'est possible.
2. Écrire un benchmark (`go test -bench`) qui compare `EitherAny` (tag entier + `Value any`, D-18) à une version avec l'information en chaîne, et mesurer le coût des assertions `.Value.(T)`, pour justifier D-09 et D-18 avec des chiffres.
3. **Comparer Node et Go** sur les projets qui passent : temps d'exécution et mémoire, même entrée. C'est le chiffre principal pour le jury.
4. **Dérouler à la compilation les helpers qui coûtent** (D-09.3) : seulement ceux que `-gcflags=-m` ou le benchmark désignent (probablement `IsRight`, et les closures de `WhenIsRight` si elles sont allouées sur le tas). Mesurer avant et après.
5. Rendre les noms de package lisibles (bug B-02) : utiliser le chemin relatif, pas le chemin absolu.
6. Relire le Go généré des projets : supprimer les temporaires inutiles et les conversions redondantes.
7. Résumer les chiffres et les choix dans `DECISIONS.md`, pour la présentation.
