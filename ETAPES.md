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
| 3 | [Représentation des `Either` en Go](#étape-3--représentation-des-either-en-go) | — | | ⬜ |
| 4 | [`print` fidèle à Node (`util.inspect`)](#étape-4--print-fidèle-à-node) | — | | ⬜ |
| 5 | [Helper de préparation](#étape-5--helper-de-préparation) | — | | ⬜ |
| 6 | [Transformers de base du langage](#étape-6--transformers-de-base-du-langage) | 5 | | ⬜ |
| 7 | [Domaine Either (handlers)](#étape-7--domaine-either) | 3, 5 | | ⬜ |
| 8 | [Domaines Common / Array / String](#étape-8--domaines-common--array--string) | 4, 5 | | ⬜ |
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
4. **Une étape est finie quand** `./.commands/check.sh NN` affiche ✓ pour les projets concernés, **et** que `pnpm test:types` passe.
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

---

## Étape 3 — Représentation des `Either` en Go

**But** : définir en Go **une seule** façon de représenter tous les résultats `Either` (success, fail, left, et leurs unions), rapide et réutilisable. C'est la fondation des projets 01 à 10.

**À lire avant** :
- `DECISIONS.md`, section D-09 (les options et la recommandation) ;
- `src/transpiler/transformers/duplojs/either/success/sharedDependency.ts` (le type `EitherSuccess[T]` existant) ;
- la sortie de référence du projet 04, dans `EXERCICES.md`, pour voir à quoi ressemble un `fail`.

**À faire** :
1. **Écrire le Go à la main d'abord**, dans un fichier de brouillon : un type qui peut représenter `Success<number> | Fail | Left<"negative-operand", number>`. Il doit contenir :
   - un **tag entier** pour la variante (constantes `TagSuccess`, `TagFail`, …), plutôt qu'une comparaison de chaînes ;
   - le côté (`right` ou `left`), l'information (en chaîne, pour l'affichage) et la valeur ;
   - les constructeurs `EitherSuccessOf[T]`, `EitherFailOf()`, `EitherLeftOf[T](info, v)` ;
   - une méthode qui donne les clés d'affichage dans le **même ordre que DuploJS** : `left`/`right`, `information`, `value`, puis `fail`/`success`.
2. **Faire valider le choix par l'équipe**, puis le noter dans `DECISIONS.md` (passer D-09 en ✅).
3. Le traduire en shared dependency, sur le modèle de `success/sharedDependency.ts`. On en fait une par opération : `fail/`, `left/`, etc.
4. Gérer la conversion d'une variante vers le type d'union, quand une fonction a plusieurs `return`.

**Où** : `src/transpiler/transformers/duplojs/either/` (un dossier par opération).

**Attention** :
- `success` a un paramètre de type `const` : `success(1)` a le type `Success<1>`, pas `Success<number>`. Il faut **élargir** le type littéral vers `number` (le checker a de quoi le faire).
- Un `fail` a pour valeur `undefined`, qui s'affiche `undefined` (voir `JSUndefined` dans les dépendances par défaut).

**Fini quand** : le type est validé en équipe et noté dans `DECISIONS.md`, et un programme Go écrit à la main avec ces types compile.

---

## Étape 4 — `print` fidèle à Node

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
3. Formatage des nombres : `strconv.FormatFloat(f, 'f', -1, 64)` pour les cas courants. Vérifier les cas limites : très grands nombres, `NaN`, `-0`.
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

**But** : traduire chaque fonction `DEither.*` utilisée dans les exercices.

**À lire avant** :
- étape 3 terminée ;
- le skill `typescript-to-go`, section « routeur puis handler » ;
- le routeur existant : `src/transpiler/transformers/duplojs/either/index.ts`.

**À faire** : ajouter un `DPattern.match` dans le routeur, et un dossier handler par fonction.

| Fonction | Traduction visée (D-09 : helpers déroulés) | Projets |
|---|---|---|
| `fail()` | constructeur `EitherFailOf()` | 04 |
| `left(info, v)` | constructeur avec le tag de `info` | 06 |
| `isRight(r)` | `r.Tag` est une variante droite | 01 |
| `whenIsRight(r, f)` | `if` droite { appliquer `f` } sinon { garder `r` } | 02, 03 |
| `whenIsRightOtherwise(r, f, g)` | `if` droite { `f(valeur)` } sinon { `g()` } | 05+ |
| `matchInformation(r, { … })` | `switch r.Tag { case …: }` | 06, 07 |
| `rightPipe(r, f, g…)` | une suite de `if` gauche { s'arrêter } sinon { étape suivante } | 07, 08 |
| `group([…])` | boucle qui s'arrête au premier `left`, sinon slice des valeurs | 09 |
| types `Fail`, `Left<…>`, unions | type d'union de l'étape 3 | 01, 04 |

**Attention** : les formes **sans données** (`DEither.whenIsRight(fn)`, utilisée dans un `pipe` ou un `map`) se traduisent avec l'étape 8. Le `pipe` fournit la donnée.

**Fini quand** : les projets 01, 02, 04, 06 et 07 n'échouent plus sur une fonction `DEither`.

---

## Étape 8 — Domaines Common / Array / String

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
2. Écrire un benchmark (`go test -bench`) qui compare notre représentation des `Either` à une version `interface{}` / `any`, pour justifier D-09 avec des chiffres.
3. Rendre les noms de package lisibles (bug B-02) : utiliser le chemin relatif, pas le chemin absolu.
4. Relire le Go généré des projets : supprimer les temporaires inutiles et les conversions redondantes.
5. Résumer les chiffres et les choix dans `DECISIONS.md`, pour la présentation.
