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

### D-10 · `pipe` / formes curryfiées — ✅ (adapté à D-09.3)
- `DCommon.pipe(x, f, g)` est **déroulé à la compilation** en `t1 := f(x)`, puis `t2 := g(t1)`. Ce n'est pas une optimisation : Go n'a pas de génériques variadiques, donc un `Pipe` générique est impossible sans écrire `Pipe2`, `Pipe3`… Le déroulé est ici le plus simple.
- Les formes curryfiées (`DEither.whenIsRight(fn)` sans données) ne sont traduites que dans un `pipe` ou un `map`, où la donnée est connue. Elles deviennent un appel au helper générique avec cette donnée : `t2 := WhenIsRight(t1, fn)`.

### D-11 · Asynchrone (projet 10) — 🟡
- Il n'y a aucune vraie entrée/sortie, donc une **exécution synchrone** (`Promise<T>` traduit en `T`) préserve l'ordre et le résultat.
- Goroutines et channels seulement en bonus, si on a le temps.

### D-12 · Rendu des nombres en chaîne — 🟡
- `DString.to(3)` doit donner `"3"` comme en JS, pas `"3.000000"`.
- Prévoir une shared dependency fidèle au formatage JS : `strconv.FormatFloat(f, 'f', -1, 64)` couvre les cas courants, à vérifier sur les exposants et `NaN`.

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

### D-15 · Organisation du travail — ✅
- Les étapes, leurs dépendances et la répartition sont dans [ETAPES.md](ETAPES.md). Chacun s'inscrit sur une étape avant de la commencer.

---

## Bugs connus du code de départ

### B-01 · `EitherSuccessOf` utilisé sans instanciation — ✅ corrigé (17/11/2026)
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
