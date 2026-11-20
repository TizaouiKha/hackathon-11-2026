# Historique · Couvrir la bibliothèque DuploJS

## 1. Quoi couvrir en priorité ? (étude du 19/11)

Nous hésitions entre deux directions : couvrir plus de **TypeScript impératif** (`let`, boucles, réaffectations) ou plus de **bibliothèque DuploJS**. Une étude a tranché :
- les 11 exercices ne contiennent **aucun** `let`, aucune réaffectation, aucune boucle ;
- le lint officiel de DuploJS (`@duplojs/code-config`) impose `prefer-const` et interdit de réaffecter un paramètre ;
- un code Duplo passe donc par la **bibliothèque**, dont seules 2 fonctions `DArray` sur 41 étaient traduites.

✅ **Priorité à la bibliothèque** (D-22 à D-26).

## 2. Comment traduire une fonction de la bibliothèque ?

| Piste | Verdict |
|---|---|
| **Transpiler le code source de DuploJS lui-même** | ❌ Il est écrit en JavaScript très dynamique (clés cachées dans les objets, `instanceof`, nombre variable d'arguments). Le traduire fidèlement demanderait de la réflexion partout. |
| **Un helper Go écrit à la main par fonction** | ✅ Pour les fonctions dont le résultat dépend des **valeurs** (`filter`, `find`, `DNumber.*`…). Ces helpers sont testés à part, contre Node. |
| **Construire le résultat à la compilation** | ✅ Pour les fonctions qui travaillent sur la **forme** d'un objet (`DObject.pick`, `omit`, `assign`, `keys`…). `pick(user, ["name"])` devient directement `struct{ Name string }{Name: user.Name}`. |

## 3. Le cas de `reduce` (D-23)

Le callback de `reduce` reçoit un objet d'outils (`{ element, lastValue, next, exit, nextPush }`) et dit comment continuer : `next(v)` ou `exit(v)`.
- **Piste écartée** : réécrire le corps du callback (remplacer `return next(x)` par une affectation). C'est fragile avec les ternaires et les `if` imbriqués.
- **Retenue** : l'objet d'outils devient un **struct Go** dont `next` et `exit` sont des fonctions qui renvoient une `ReduceStep { Exit; Value }`. Le corps du callback, déstructuration comprise, se traduit alors comme du code normal. Seul `tsTypeToGo` a dû apprendre les types de `reduce`.

## 4. Organisation du code : une table de routage

Chaque domaine (`DArray`, `DObject`…) a un routeur qui envoie chaque fonction vers son handler. Au départ, c'était une chaîne de `DPattern.match` dans un `pipe`. Un merge l'a cassée, car `pipe` est limité à **16 arguments**. Les routeurs sont devenus des **tables** (`Record<nom, handler>`) : il n'y a plus de limite, et c'est plus lisible.

## 5. Différences assumées

- `includes` sur des objets compare **le contenu** en Go, **les références** en JS. `equal` sur des objets est refusé pour la même raison.
- Après `assign` ou `transformProperty`, l'ordre d'affichage suit le type TS (le champ modifié en dernier). Les valeurs sont identiques.

**Vérifié** : `tests/darray-functions`, `darray-reduce`, `dobject`, `dnumber` (avec `NaN`, `Infinity`, `-0`, `2^53`), `dcommon`, chacun comparé à Node.
