# Transpileur DuploJS : TypeScript → Go

Hackathon ESGI, novembre 2026. Le but : prendre du **TypeScript écrit avec DuploJS** (`@duplojs/lang`) et produire du **Go** qui donne **exactement la même sortie**, pour profiter de la performance de Go.

> **En bref**
> - Les **11 projets d'exercices (00 à 10)** produisent une sortie **identique** à celle de TypeScript.
> - **27 suites de tests d'exécution** comparent chaque fonctionnalité au résultat de Node.
> - Bien au-delà des exercices : les fonctions courantes de `DEither`, `DArray`, `DObject`, `DNumber`, `DCommon` et `DString`, et les unions de n'importe quels types connus.

Ce README résume le projet. Le détail est dans les autres documents :

| Document | Contenu |
|---|---|
| [DECISIONS.md](DECISIONS.md) | Chaque choix d'architecture (`D-xx`) : le problème, la solution retenue, ce qui a été vérifié |
| [ETAPES.md](ETAPES.md) | Le découpage du travail en étapes, qui a fait quoi, et ce qui reste à faire |
| [EXERCICES.md](EXERCICES.md) | Les 11 projets : ce qu'ils demandent, le Go produit, la sortie attendue |
| [docs/objets-typescript-go.md](docs/objets-typescript-go.md) | Comment un objet TypeScript devient un struct Go (support de présentation) |
| [docs/objets-sous-types-et-any.md](docs/objets-sous-types-et-any.md) | L'objet temporaire (sous-types) et les objets `any` |

---

## 1. Comment ça marche

Le transpileur travaille **d'arbre à arbre**. Il ne manipule jamais le texte du code source, et il n'utilise **aucune regex** pour traduire.

```
fichier .ts
   │  compilateur TypeScript
   ▼
arbre TypeScript (AST) ──── + le checker TypeScript : le type exact de chaque nœud
   │  transformeurs (src/transpiler/transformers/)
   ▼
arbre Go (AST)             ── construit avec nos fabriques (src/go/AST/)
   │  GoPrinter
   ▼
fichier .go  ──►  go build  ──►  même sortie que Node
```

1. **Le compilateur TypeScript** lit le fichier et donne son arbre. Son **checker** nous dit le type de chaque nœud : le type déclaré, le type rétréci par un `if`, le type attendu à cet endroit.
2. **Les transformeurs** parcourent l'arbre. Chacun reconnaît un genre de nœud (un appel, un `if`, un objet littéral, un `DArray.map`…) et fabrique le **nœud Go** équivalent.
3. **L'arbre Go** est imprimé en texte par `GoPrinter`.
4. **Les « shared dependencies »** : les petites fonctions Go dont le code généré a besoin (`Map`, `JSNumberToString`, `Inspect`…) sont écrites une seule fois, dans un paquet `shard_dependencies` commun à tous les fichiers générés.

### Organisation du code

```
src/
├── go/AST/                    l'arbre Go : une fabrique par genre de nœud (struct, slice, appel, if…)
├── go/printer/                arbre Go → texte Go
└── transpiler/
    ├── context/               le contexte de build (checker, dépendances, noms générés…)
    └── transformers/
        ├── expression/        appels, opérateurs, objets, accès aux champs, adaptation des types…
        ├── statement/         if, switch, boucles, return, variables…
        ├── declaration/       fonctions, types
        ├── type/              tsTypeToGo : type TypeScript → type Go
        └── duplojs/           un dossier par domaine : either/, array/, object/, number/, common/, string/
tests/<nom>/                   tests d'exécution (TS + check/main.go)
projects/00 … 10/              les exercices du hackathon
```

---

## 2. Lancer et vérifier

Tout se lance **sous WSL**, pas sous Windows natif (D-01).

```bash
pnpm install

# Transpiler un projet
pnpm build --tsconfig projects/05/tsconfig.json --input projects/05/index.ts --output projects/05/dist

# Valider un projet : transpile, compile, exécute le Go ET le TypeScript, puis compare les sorties
./.commands/check.sh 05

# Les tests d'exécution (tous, ou un seul)
pnpm test:runtime
./.commands/test-runtime.sh unions

# Types et lint
pnpm test:types
pnpm test:lint
```

**Notre règle de validation (D-14)** : une fonctionnalité n'est considérée comme faite que si sa sortie Go est **identique** à celle de Node.
- Pour un projet complet, `check.sh` fait un `diff` des deux sorties.
- Pour une brique isolée, un test d'exécution `tests/<nom>/` transpile un petit fichier TS, et un `check/main.go` écrit à la main vérifie chaque valeur contre celle obtenue avec Node.

---

## 3. Les problématiques rencontrées

TypeScript et Go ne pensent pas de la même façon. Chaque section ci-dessous présente **le problème**, **notre solution**, et **ce qui reste différent** de JavaScript quand il y a une différence.

### 3.1 Les types : TypeScript est structurel, Go est nominal

**Le problème.** En TypeScript, deux objets « vont ensemble » s'ils ont les bons champs : un `User` complet convient là où `{ name: string }` est attendu. En Go, `struct{ id; name; email }` et `struct{ name }` sont deux types **différents**, et le compilateur refuse de passer l'un pour l'autre.

**Notre solution : l'objet temporaire (D-21).** Les deux formes sont connues à la compilation. Le transpileur écrit donc lui-même la copie des champs utiles :

```go
// test(user)  avec  function test(arg: { name: string })
Sourced_test(struct{ Sourced_name string }{Sourced_name: Sourced_user.Sourced_name})
```

C'est une copie de cases, sans recherche ni réflexion à l'exécution. Ça marche aussi pour les objets imbriqués et les listes d'objets.

**Ce qui reste différent.** Un objet renvoyé sous le type plus petit ne contient plus que les champs de ce type. Si on l'affiche, Go montre `{ name: 'Ada' }`, là où Node montre l'objet complet. Le programme, lui, ne peut pas lire les autres champs : TypeScript l'interdit.

### 3.2 Une seule couche pour traduire les types : `tsTypeToGo` (D-18)

**Le problème.** TypeScript a des unions, des types littéraux (`"admin"`), des marques (`number & Positive`), des types calculés (`Extract`, `ReturnType`), des génériques… Go n'a rien de tout ça.

**Notre solution.** **Un seul endroit** traduit un type du checker en type Go : `src/transpiler/transformers/type/tsTypeToGo.ts`.

| TypeScript | Go |
|---|---|
| `number` | `float64` (D-08) |
| `string`, `boolean` | `string`, `bool` |
| `null`, `undefined` | `JSNull`, `JSUndefined` |
| objet | struct anonyme, chaque champ avec son nom TS en tag (`json:"name"`) |
| tableau, tuple | slice (`[]T`, ou `[]any` si les positions ont des types différents) |
| `Record<string, T>` | `map[string]T` |
| union d'`Either` | `EitherAny` |
| union de types différents | `any` (voir 3.4) |
| `"a" \| "b"` | `string` (même type Go) |
| `Promise<T>` | `T` (exécution synchrone, voir 3.8) |

### 3.3 Les `Either` de DuploJS

**Le problème.** DuploJS ne lance pas d'exceptions : une fonction renvoie un `Either`, c'est-à-dire un succès ou une erreur, chacun identifié par une **information** (`"division-by-zero"`) et portant une valeur de son propre type. Une fonction peut renvoyer autant d'issues qu'elle veut.

**Notre solution (D-09, puis D-18).**
```go
type EitherAny struct {
    Tag   EitherTag // l'issue : un entier (1 octet), une constante générée par information
    Value any       // la valeur, de n'importe quel type
}
```
- **L'information est un entier**, pas une chaîne : comparer deux issues tient en une instruction. Deux tables générées retrouvent le côté (succès ou erreur) et le texte de l'information.
- **La valeur est dans un `any`.** À chaque endroit où le code la lit, le checker connaît son type exact, et le transpileur génère une simple assertion : `e.Value.(float64)`, environ 1 ns.
- Tous les helpers sont traduits : `success`, `left`, `fail`, `isRight`, `isLeft`, `whenIsRight`, `whenIsRightOtherwise`, `rightPipe`, `rightAsyncPipe`, `matchInformation`, `group`, `asyncGroup`, `unwrapRight`…

### 3.4 Les unions de types connus (D-27)

**Le problème.** Un paramètre `string | "admin" | User` peut contenir un string **ou** un objet. Go n'a pas d'union : la seule boîte qui accepte les deux est un `any`. Il faut ensuite pouvoir ressortir la donnée, rapidement et sans erreur.

**Notre solution.** Côté Duplo, le lint interdit `any` : chaque membre d'une union est donc connu à la compilation. D'où la règle :

> Toute valeur qui entre dans une union est rangée sous le type Go **exact** de son membre.

- **Entrer** : un objet plus grand ou dans un autre ordre est d'abord converti vers le type de son membre. Un objet littéral écrit directement dans une union (`["x", { name: "Bob" }]`) est construit au type du membre auquel il correspond.
- **Ressortir** : une simple assertion, `value.(User)`, sans réflexion.
- **Lire un champ commun** (`shape.kind`) : un `switch` sur les types Go possibles.
- **`"barks" in animal`** : décidé à la compilation pour chaque membre, puis un `switch` sur le type.
- **`typeof`, `===` sur un littéral, unions discriminées** : tout passe.

**Ce qui reste différent.** Deux membres qui donnent exactement le même type Go (deux objets de même forme) ne peuvent pas être distingués à l'exécution : ils sont fusionnés.

### 3.5 Le type dépend de l'endroit : le narrowing (D-18.2)

**Le problème.** En TypeScript, une même variable change de type selon l'endroit : après `if (isRight(result))`, `result` est un succès. En Go, une variable a **un seul** type, celui de sa déclaration.

**Notre solution : l'adaptateur** (`expression/adapt.ts`). Pour chaque expression, il compare trois types donnés par le checker :
- **produit** : ce que le Go fabrique vraiment, c'est-à-dire le type déclaré ;
- **rétréci** : le type à cet endroit ;
- **attendu** : le paramètre appelé, le type de retour…

Selon le cas, il insère une assertion (`x.(T)`, `x.Value.(T)`), range une valeur dans un `EitherAny`, la convertit vers le bon struct (3.1) ou vers le bon membre d'union (3.4).

### 3.6 Les nombres

**Le problème.** JavaScript n'a qu'un type de nombre (un flottant 64 bits) avec ses propres règles : `%` garde le signe du dividende, les opérateurs bit à bit travaillent en entiers 32 bits, `1/0` vaut `Infinity`. Surtout, `String(x)` écrit `3` et non `3.000000`, passe en notation exponentielle à partir de `1e21`, et écrit `NaN`, `Infinity` et `0` pour `-0`.

**Notre solution.**
- `number` → `float64` partout ;
- `%` → `math.Mod`, même signe que JS ;
- opérateurs bit à bit en `int32`, comme JS ;
- une division par la constante `0` passe par une variable : Go refuse de compiler `x / 0`, alors que JS donne `Infinity` ;
- **`JSNumberToString` (D-12)** suit pas à pas l'algorithme de la spécification ECMAScript. Vérifié sur **2 034 nombres** comparés à Node (cas limites et nombres aléatoires), sans aucun écart ;
- les 22 fonctions `DNumber` respectent les cas limites (`NaN`, `Infinity`, `-0`, `2^53`).

### 3.7 L'affichage : `print` doit imiter Node (D-13)

**Le problème.** `DCommon.print(x)` appelle `console.info`, donc Node formate avec `util.inspect` : guillemets simples dans les objets, `[ 3 ]` pour les tableaux, `undefined` affiché, retour à la ligne au-delà de 80 caractères… `json.Marshal` de Go ne donne pas du tout ce format.

**Notre solution.** Un `Inspect` écrit en Go, qui parcourt la valeur et retrouve les noms des champs TS grâce aux tags des structs.

**Ce qui reste différent.** Au-delà de 6 nombres, Node répartit un tableau sur plusieurs lignes. Notre `Inspect` le laisse sur une seule ligne.

### 3.8 L'asynchrone (D-11)

**Le problème.** Le projet 10 utilise `async` / `await`, `asyncPipe`, `rightAsyncPipe` et `asyncGroup`.

**Notre solution.** Les programmes ne font aucune vraie entrée-sortie (réseau, fichiers). Une **exécution synchrone** garde donc l'ordre et le résultat : `Promise<T>` devient `T`, et `await x` devient `x`. `asyncGroup` exécute ses étapes dans l'ordre et s'arrête à la première erreur, exactement comme DuploJS.

### 3.9 L'ordre d'évaluation (R-01 n° 2)

**Le problème.** JavaScript évalue les arguments de gauche à droite : dans `f(x, change())`, `x` est lu **avant** l'appel de `change()`. En Go, le moment où une variable est lue par rapport à un appel voisin n'est pas garanti. Et le transpileur sort parfois un calcul avant l'expression. `f(x, change())` pouvait donc lire le nouveau `x`.

**Notre solution** (`shared/sequence.ts`). Quand un argument plus à droite a des calculs sortis avant l'expression, les variables lues à sa gauche sont d'abord copiées. Aucune copie inutile : les constantes, les fonctions et les variables jamais réaffectées sont lues directement.

### 3.10 Les fonctions passées en valeur et les formes curryfiées (D-10, D-17)

**Le problème.** En Duplo, on passe souvent une fonction directement (`DArray.filter(list, DNumber.isEven)`) ou sa forme « à moitié appliquée » dans un `pipe` (`DArray.filter((x) => x > 2)`). Go est strict sur la signature exacte d'une fonction.

**Notre solution.**
- **Une forme curryfiée** devient une fonction Go littérale, typée par la signature que le checker attend à cet endroit. Ses arguments ne sont évalués qu'une fois.
- **Une fonction Duplo passée en valeur** devient directement son helper Go : `DNumber.isEven` → `shard_dependencies.NumberIsEven`.
- **Si le callback déclare moins de paramètres** que ce que le helper lui passe (`map` passe aussi `{ index, self }`), il est enveloppé.

### 3.11 La fin des fonctions (D-27, partie 2)

**Le problème.** Après un `switch` qui couvre tous les cas d'une union, TypeScript sait que la fin de la fonction est inatteignable. Go l'ignore et refuse de compiler (`missing return`).

**Notre solution.** Si le corps Go ne se termine pas selon les règles de Go, on ajoute une sortie qui n'est jamais atteinte. On ne l'ajoute que dans ce cas, sinon `go vet` signalerait du code inatteignable.

### 3.12 Les chaînes : UTF-16 contre UTF-8

**Le problème.** `"é".length` vaut 1 en JavaScript (UTF-16), mais `len("é")` vaut 2 en Go (UTF-8). Même écart pour `slice`, `charAt`, `indexOf`…

**Notre solution.** Des helpers (`JSStringLength`, `JSStringSlice`…) calculent en unités UTF-16, comme JS. Les fonctions `DString` traduites : `to`, `length`, `toUpperCase`, `toLowerCase`, `includes`, `startsWith`, `endsWith`, `charAt`, `at`, `indexOf`, `slice`, `substring`.

### 3.13 Ce qu'on refuse exprès

Certaines constructions ne peuvent pas être imitées fidèlement. Le transpileur les **refuse avec un message d'erreur clair** au lieu de produire un Go qui donnerait un autre résultat :
- **modifier un champ d'objet** (`obj.x = 1`) : en JS, l'objet est partagé ; en Go, un struct est copié. Il faudrait des pointeurs, ce qui reste à décider ;
- **`equal` sur des objets** : JS compare des références, Go des valeurs ;
- **`assign` avec un champ facultatif** : JS distingue « absent » et « présent mais `undefined` », Go non.

---

## 4. Ce qui est couvert

### La bibliothèque DuploJS

| Domaine | Traduit |
|---|---|
| `DEither` | les helpers des exercices : `success`, `left`, `fail`, `isRight`, `isLeft`, `whenIsRight`, `whenIsRightOtherwise`, `rightPipe`, `rightAsyncPipe`, `matchInformation`, `group`, `asyncGroup`, `unwrapRight`… |
| `DArray` | `map`, `filter`, `find`, `findIndex`, `some`, `every`, `includes`, `push`, `concat`, `length`, `coalescing`, `reduce` (avec `next`, `exit`, `nextPush`), `reduceFrom` |
| `DObject` | `pick`, `omit`, `assign`, `override`, `getProperty`, `getDeepProperty`, `transformProperty`, `keys`, `values`, `entries`, `countKeys` |
| `DNumber` | les 22 fonctions (comparaisons, `isEven`, `isInteger`, `isSafe`, `sum`, `max`, `min`, `sort`…) |
| `DCommon` | `pipe`, `asyncPipe`, `print`, `when`, `whenNot`, `whenElse`, `equal`, `and`, `or`, `tap`, `truthy`, `falsy`, `isType`, `justExec`, `justReturn`, `forward` |
| `DString` | `to`, et les fonctions de chaîne listées en 3.12 |

Chaque fonction marche avec données (`DArray.filter(list, f)`), dans un `pipe` (`DArray.filter(f)`) et, quand elle n'a qu'un argument, passée directement à une autre fonction.

### Le langage TypeScript

Variables, `if` / `else`, ternaire, `switch`, boucles `for…of`, `while` et `for`, `break` / `continue`, affectations (`+=`, `++`), fonctions et fonctions fléchées, déstructuration de tableaux et d'objets, objets littéraux, accès aux champs et aux éléments, template strings, `typeof`, `??`, `in`, `Math.*`, interfaces et alias de types, sous-types (3.1) et unions (3.4).

---

## 5. Les différences assumées avec JavaScript

Elles sont rares, documentées dans [DECISIONS.md](DECISIONS.md), et chacune est vérifiée telle quelle par un test.

| Situation | Node | Notre Go | Pourquoi |
|---|---|---|---|
| objet renvoyé sous un type plus petit, puis affiché | l'objet complet | les champs du type déclaré | un struct a une forme fixe (3.1) |
| ordre d'affichage des champs après `assign` / `transformProperty` | l'ordre d'origine | l'ordre du type TS | changer l'ordre donnerait un autre type Go |
| tableau de plus de 6 nombres affiché | sur plusieurs lignes | sur une ligne | le regroupement de `util.inspect` n'est pas encore imité |
| `includes` sur des objets | compare les références | compare le contenu | Go compare des valeurs |

---

## 6. Ce qui reste à faire

La liste complète et les pistes sont dans [ETAPES.md](ETAPES.md) (étape 12).
- **DuploJS** : les autres fonctions `DArray` (`flatMap`, `sort`, `slice`, `reverse`, `group`…), le reste de `DObject` (`to`, `fromEntries`, `hasKeys`…) et de `DCommon` (`loop`, `innerPipe`, `memo`, `clone`…), `DString.split` / `replace`, qui demandent les regex.
- **TypeScript** : passer un objet à un `Record<string, T>`, `?.`, les méthodes natives (`values.map`, `text.trim`), `{ ...objet }`, `Number.NaN`.
- **Solidité** : lire le genre d'un type Go sur son nœud plutôt que sur son texte imprimé. Ça protégerait le transpileur le jour où l'écriture des types Go changerait (structs nommés, pointeurs).

---

## 7. Organisation du travail

- **Une branche par tâche**, et une PR sur le fork `TizaouiKha/hackathon-11-2026`, jamais sur le dépôt des organisateurs (D-15).
- **Avant de prendre une étape**, on s'inscrit dans [ETAPES.md](ETAPES.md).
- **Chaque choix est écrit** dans [DECISIONS.md](DECISIONS.md) avec ce qui a été vérifié. Les relectures de PR y sont aussi (`R-xx`).
