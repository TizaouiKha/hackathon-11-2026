# Les objets : de TypeScript à Go

> Support de présentation. Il explique **comment notre transpileur traduit un objet TypeScript en Go**, et **pourquoi c'est rapide**.
> Les exemples Go sont ceux que le transpileur produit réellement (tests `tests/language-extended/`). Seule la mise en forme est allégée.

---

## 1. L'idée en une phrase

> **En JavaScript, un objet est un dictionnaire qu'on fouille pendant l'exécution.
> En Go, on en fait une « boîte à compartiments » dont la forme est fixée avant même de lancer le programme.**

---

## 2. Deux façons de ranger un objet

### En JavaScript : un dictionnaire

```ts
const user = { name: "ada", age: 36 };
user.age; // JS cherche la clé "age" dans l'objet, pendant l'exécution
```

L'objet garde **ses noms de champs** avec lui. Lire `user.age` revient à demander : « as-tu une clé `"age"` ? Si oui, donne-moi sa valeur ».

```
user ──► { "name" → "ada", "age" → 36 }     (les noms voyagent avec l'objet)
```

### En Go : un struct

```go
user := struct {
	Name string
	Age  float64
}{Name: "ada", Age: 36}

user.Age // le compilateur sait déjà OÙ se trouve Age : aucune recherche
```

Le struct ne contient **que les valeurs**, rangées à des places fixes. Les noms n'existent que dans le code source, et le compilateur les remplace par des positions.

```
user ──► [ "ada" | 36 ]     (case 1 = name, case 2 = age : décidé à la compilation)
```

**Analogie pour l'oral** : JS, c'est un sac où chaque objet porte une étiquette et où l'on fouille pour trouver la bonne. Go, c'est un casier numéroté : on sait d'avance que l'âge est dans le casier n° 2, on y va directement.

---

## 3. Qui fait la traduction ? TypeScript

Le point clé : **TypeScript connaît déjà la forme de chaque objet.** Notre transpileur lui demande ce type, puis le traduit en Go avec **une seule fonction centrale**, `tsTypeToGo`.

```ts
// TypeScript
export function userAge(name: string, age: number) {
	const user = { name, age };

	return user.age + 1;
}
```

```go
// Go généré
func Sourced_userAge(Sourced_name string, Sourced_age float64) float64 {
	Sourced_user := struct {
		Sourced_name string  `json:"name"`
		Sourced_age  float64 `json:"age"`
	}{
		Sourced_name: Sourced_name,
		Sourced_age:  Sourced_age,
	}

	return Sourced_user.Sourced_age + 1
}
```

Ce qu'il faut remarquer :

| Ce qu'on voit | Pourquoi |
|---|---|
| `{ name: string; age: number }` → `struct { … string; … float64 }` | `tsTypeToGo` traduit chaque champ : `number` → `float64`, `string` → `string` |
| Le préfixe `Sourced_` | Tous les noms venus du code TS le portent : pas de collision avec nos noms internes, et ils sont « exportés » en Go |
| `user.age` → `Sourced_user.Sourced_age` | Même règle de nommage : on tombe toujours sur le bon champ |
| `` `json:"age"` `` | Le **vrai nom TS**, gardé uniquement pour l'affichage (voir § 6) |

---

## 4. Lire une propriété : ce que fait le transpileur

Pour `quelqueChose.champ`, le transpileur demande à TypeScript **le type de `quelqueChose`**, puis choisit :

| Type de l'objet | TypeScript | Go généré |
|---|---|---|
| objet (forme connue) | `user.age` | `user.Sourced_age` (accès direct) |
| objet imbriqué | `team.leader.name` | `team.Sourced_leader.Sourced_name` |
| tableau | `values.length` | `float64(len(values))` |
| chaîne | `text.length` | `JSStringLength(text)` (compte comme JS : `"😀".length` vaut 2) |
| dictionnaire (`Record<string, number>`) | `scores[key]` | `JSMapGet(scores, key)` (renvoie `undefined` si la clé n'existe pas) |

Le cas du **dictionnaire** est le seul où l'on cherche une clé pendant l'exécution, comme en JS. C'est normal : ses clés ne sont connues qu'à l'exécution. (D'où vient `JSMapGet` ? Voir le § 4 bis.)

```ts
const scores: Record<string, number> = { ada: 36, bob: 7 };

scores[key];
```

```go
scores := map[string]float64{"ada": 36, "bob": 7}

shard_dependencies.JSMapGet(scores, key) // 36, 7, ou undefined pour "eve"
```

---

## 4 bis. D'où sortent `JSMapGet`, `JSStringLength`… ?

Ce sont des **dépendances partagées** (*shared dependencies*) : des petites fonctions Go, écrites **une seule fois** dans le transpileur, que le code généré appelle quand Go ne fait pas exactement comme JavaScript.

### Où elles atterrissent : le paquet `shard_dependencies`

Quand on transpile un projet, on obtient un dossier `dist/` :

```
dist/
├── main.go                     point d'entrée
├── index.ts/index.ts.go        un paquet Go par fichier TS (le code de l'utilisateur)
├── add.ts/add.ts.go
└── shard_dependencies/         la « boîte à outils » commune
    └── shard_dependencies.go   JSMapGet, JSStringLength, EitherAny, Inspect…
```

Le code de l'utilisateur l'importe et l'appelle par son nom de paquet :

```go
import "duplojs.local/transpiled/shard_dependencies"

shard_dependencies.JSMapGet(scores, key)
```

**Seuls les helpers réellement utilisés sont copiés** dans `shard_dependencies.go`. Si aucun code ne lit de `Record`, `JSMapGet` n'y figure pas.

### Où elles sont écrites : dans le transpileur

`JSMapGet` est écrit dans **`src/transpiler/transformers/expression/javascriptValues.ts`**. Ce fichier TypeScript ne s'exécute pas tel quel : il **construit le code Go** du helper (avec l'AST Go), et le range dans une dépendance partagée (`javascriptValuesDependency`).

Voici le Go qu'il produit, tel qu'on le retrouve dans `dist/shard_dependencies/shard_dependencies.go` :

```go
func JSMapGet[K comparable, V any](values map[K]V, key K) any {
	var value V
	var found bool
	value, found = values[key] // Go dit si la clé existe…
	if !found {
		return JSUndefined{}   // …et si elle n'existe pas, on renvoie undefined, comme JS
	}
	return value
}
```

**Pourquoi un helper ?** En Go, lire une clé absente d'une `map` renvoie silencieusement **zéro** (`scores["eve"]` vaut `0`). En JavaScript, ça renvoie **`undefined`**. `JSMapGet` rétablit le comportement de JS.

### Comment elles arrivent dans le Go : le transformer les « enregistre »

Quand le transformer d'accès (`expression/access.ts`) rencontre `scores[key]`, il écrit :

```ts
go.call(javascriptValue(context, "mapGet"), [target, key]);
```

`javascriptValue(context, "mapGet")` fait deux choses :
1. elle **enregistre** la dépendance : `JSMapGet` sera copié dans `shard_dependencies.go`, avec ce dont il a besoin (`JSUndefined`…), et le fichier recevra `import ".../shard_dependencies"` ;
2. elle renvoie le nom à appeler : `shard_dependencies.JSMapGet`.

```
expression/access.ts            javascriptValues.ts                dist/
 voit scores[key]  ──appelle──►  javascriptValue("mapGet") ──►  shard_dependencies.go  contient JSMapGet
                                                            └─►  index.ts.go appelle shard_dependencies.JSMapGet(...)
```

### Les principales, et où les trouver

| Helper Go | Rôle | Écrit dans |
|---|---|---|
| `JSMapGet`, `JSElementAt` | lire un `Record` / un tableau, `undefined` si absent | `transformers/expression/javascriptValues.ts` |
| `JSToString`, `JSTypeOf`, `JSIsNullish` | `String(x)`, `typeof x`, `x == null` | idem |
| `JSStringLength`, `JSStringSlice`… | chaînes en UTF-16, comme JS | `transformers/duplojs/string/core/sharedDependency.ts` |
| `JSNumberToString` | `3` et non `3.000000` | `transformers/duplojs/string/to/sharedDependency.ts` |
| `Map` | `DArray.map` | `transformers/duplojs/array/map/sharedDependency.ts` |
| `EitherAny`, `WhenIsRight`, `Group`… | les `Either` | `transformers/duplojs/either/…` |
| `Inspect`, `Print` | `DCommon.print`, comme `console.log` | `transformers/duplojs/common/print/sharedDependency.ts` |
| `JSNull`, `JSUndefined` | `null` / `undefined` | `sharedDependency/defaults/` |

**À dire à l'oral** : « Quand Go et JavaScript se comportent différemment, on n'improvise pas à chaque fois : on écrit une fois un petit helper Go qui imite JavaScript, et le transpileur ne l'ajoute au programme que s'il sert. »

---

## 5. Créer un objet : est-ce qu'on recalcule tout ?

**Non.** Il faut séparer deux moments.

### Avant de lancer le programme (transpilation, puis compilation Go)

- Le transpileur traduit le type TS en struct Go là où il en a besoin.
- Le compilateur Go fige la forme du struct : il sait que `age` est à telle position.

**C'est fait une seule fois.**

### Pendant l'exécution

Créer l'objet revient seulement à **remplir les cases** :

```go
user := struct{ … }{Sourced_name: name, Sourced_age: 36}
```

Il n'y a aucun calcul de forme, aucun dictionnaire à construire et aucun nom à stocker. Le plus souvent, Go le range même sur la **pile**, sans allocation mémoire, tant que l'objet ne sort pas de la fonction.

```
                    AVANT l'exécution                  PENDANT l'exécution
 TypeScript ──► transpileur ──► compilateur Go ──► programme : remplit les cases
 { name, age }   struct {…}     positions figées      ["ada" | 36]
```

---

## 6. Alors, comment `print` connaît-il les noms ?

`DCommon.print(user)` doit afficher exactement comme Node :

```
{ name: 'ada', age: 36 }
```

Les noms ne sont pas dans les valeurs. Ils sont dans le **tag** de chaque champ, qui fait partie du type :

```go
Sourced_age float64 `json:"age"`
```

`print` lit ce tag par réflexion, **seulement au moment d'afficher**. Le reste du programme ne s'en sert jamais.

---

## 7. Et quand un champ peut manquer ? (le narrowing)

```ts
function greet(user: { name?: string }) {
	if (user.name !== undefined) {
		return user.name; // ici, TypeScript sait que c'est une string
	}

	return "anonyme";
}
```

- `name?: string` vaut `string | undefined` : en Go, ce champ est une « boîte » `any`, qui peut contenir une chaîne **ou** `undefined`.
- Après le `if`, **TypeScript** sait que c'est une `string`, mais **Go** ne le sait pas.
- Notre **adaptateur** compare ce que Go contient (`any`) avec ce que TypeScript sait (`string`), et ouvre la boîte. En simplifiant :

```go
return user.Sourced_name.(string) // « ouvre la boîte : je sais que c'est une string »
```

Vérifié à l'exécution : `greet({ name: "ada" })` donne `ada`, et `greet({})` donne `anonyme`, comme en Node.

C'est sans risque : **TypeScript a déjà vérifié** que c'est bien une `string` à cet endroit. C'est exactement le même mécanisme que pour nos `Either`.

---

## 8. Déstructurer : `{ index }`

```ts
DArray.map(values, (value, { index }) => value + index);
```

```go
shard_dependencies.Map(values, func(value float64, p struct {
	Sourced_index float64   `json:"index"`
	Sourced_self  []float64 `json:"self"`
}) float64 {
	index := p.Sourced_index // une simple lecture de champ

	return value + index
})
```

`indexed([10, 20, 30])` donne `[10, 21, 32]` en Go, comme en Node.

---

## 9. Ce qu'on refuse exprès : modifier un champ

```ts
user.age = 37; // refusé : erreur claire "object-mutation-not-supported-yet"
```

**Pourquoi ?** Un objet JS est **partagé**, alors qu'un struct Go est **copié**.

```ts
// JavaScript : les deux variables désignent LE MÊME objet
const a = { age: 36 };
const b = a;
b.age = 37;
a.age; // 37
```

```go
// Go : b est une COPIE de a
a := struct{ Age float64 }{Age: 36}
b := a
b.Age = 37
a.Age // 36 !  le programme donnerait un autre résultat que Node
```

Plutôt que de produire un programme **faux sans le dire**, le transpileur s'arrête avec un message clair. Le style DuploJS ne modifie de toute façon presque jamais ses objets : il en crée de nouveaux.

> Les **tableaux** n'ont pas ce problème : une slice Go partage sa mémoire, comme un tableau JS. `values[0] = 42` est donc accepté.

---

## 10. À retenir (pour la présentation)

1. **TypeScript connaît la forme de chaque objet** : on s'en sert pour fabriquer un **struct Go** avant l'exécution.
2. **Lire un champ est un accès direct à une case**, pas une recherche par nom comme en JS : c'est l'une des raisons pour lesquelles le Go généré est rapide.
3. **Créer un objet, c'est seulement remplir les cases.** La forme n'est jamais recalculée pendant l'exécution, et l'objet reste souvent sur la pile.
4. **Les noms TS ne servent qu'à l'affichage** : ils sont rangés dans des tags, lus par `print`.
5. **Quand Go ne sait pas mais que TypeScript sait** (champ optionnel), on ouvre la boîte avec une assertion, sans risque.
6. **On refuse ce qu'on ne sait pas traduire fidèlement** (modifier un champ) plutôt que de produire un résultat faux.

| | JavaScript | Notre Go |
|---|---|---|
| Forme de l'objet | découverte à l'exécution | **fixée avant l'exécution** |
| Lire `user.age` | chercher la clé `"age"` | aller à la case n° 2 |
| Noms des champs | stockés dans chaque objet | dans le code, et dans un tag pour `print` |
| Créer un objet | construire un dictionnaire | remplir les cases (souvent sans allocation) |
| `b = a`, puis modifier `b` | `a` change aussi | `a` ne change pas : **on refuse ce cas** |

**Vérifié** : `tests/language-extended/` compare 86 résultats du Go à ceux de Node, caractère pour caractère, dont tous les exemples de ce document.
