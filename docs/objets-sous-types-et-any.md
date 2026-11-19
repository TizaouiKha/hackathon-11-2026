# Passer un objet « plus grand » à une fonction, et les objets `any`

> Support de présentation, à lire après [`objets-typescript-go.md`](objets-typescript-go.md) (comment un objet devient un struct Go).
> Il répond à deux questions qu'on nous a posées :
> 1. **« Si une fonction attend `{ name }` et qu'on lui passe un `User` complet, ça marche ? Faut-il un objet temporaire ? »**
> 2. **« Et si l'objet est un `any`, construit sans son interface ? »**

---

## 1. Le cas posé par le prof

```ts
interface User {
	id: number;
	name: string;
	email: string;
	isActive: boolean;
}

function test(arg: { name: string }) {
	return DCommon.print(arg.name);
}

const user: User = {
	id: 1,
	name: "John Doe",
	email: "",
	isActive: true,
};

test(user); // affiche : John Doe
```

**En TypeScript, c'est parfaitement valide.** `test` demande « un objet qui a un `name` ». `User` en a un (et d'autres champs en plus), donc TypeScript l'accepte.

---

## 2. Pourquoi TypeScript accepte : le typage « par la forme »

TypeScript compare les objets **par leur forme** (on dit *typage structurel*) : si un objet a **au moins** les champs demandés, il convient.

```
Ce que test demande :   { name }
Ce que user contient :  { id, name, email, isActive }   ✔ il a bien un name
```

**Analogie pour l'oral** : un videur qui demande « montre-moi ta carte d'identité ». Tu as un portefeuille entier (carte bleue, permis, carte d'identité…) ; il ne regarde que la carte d'identité, et tu entres.

---

## 3. Pourquoi Go refuse

Rappel : chez nous, un objet devient un **struct Go**, une boîte à cases de **forme fixe**.

```go
// user : 4 cases
struct {
	Sourced_id       float64
	Sourced_name     string
	Sourced_email    string
	Sourced_isActive bool
}

// ce que test attend : 1 case
struct {
	Sourced_name string
}
```

Pour Go, ce sont **deux types différents**. Il n'a pas de « tu as au moins les bons champs, ça ira » : la forme doit être **exactement** la même.

```go
Sourced_test(Sourced_user) // ❌ erreur de compilation Go :
                           // cannot use user (struct à 4 champs) as struct{ Sourced_name string }
```

**Analogie** : en Go, le videur exige que tu viennes **avec ta carte d'identité seule dans la main**. Avec le portefeuille entier, il ne te laisse pas entrer.

> **État actuel** : ce cas **ne compile pas encore** avec notre transpileur. C'est la prochaine étape (voir § 5).

---

## 4. La solution retenue : l'objet temporaire

La réponse à la question du prof est **oui** : en Go, il faut **un objet temporaire** qui ne contient que ce que la fonction attend.

Comme **TypeScript connaît les deux formes à la compilation** (celle de `user` et celle attendue par `test`), le transpileur peut **écrire lui-même** cet objet, une fois pour toutes :

```go
Sourced_test(struct {
	Sourced_name string
}{
	Sourced_name: Sourced_user.Sourced_name, // on copie seulement la case utile
})
```

On sort la carte d'identité du portefeuille, et on la tend.

### Pourquoi c'est la bonne solution

| Question | Réponse |
|---|---|
| Ça coûte cher ? | Non : une **copie de case** (ici, une chaîne). En général, l'objet temporaire est sur la **pile**, sans allocation mémoire. |
| On perd des données ? | Non : `test` ne peut lire **que** `name`, TypeScript lui interdit le reste. On ne copie que ce qu'elle peut voir. |
| C'est calculé quand ? | **Avant** l'exécution, par le transpileur. À l'exécution, il n'y a ni recherche ni réflexion : juste une copie. |
| Et si `test` modifie `arg` ? | Elle modifierait la copie, pas `user`. C'est pour ça que modifier un champ d'objet est **déjà refusé** (D-19) : en JS, `user` changerait aussi. |

### Et les objets imbriqués, les tableaux ?

C'est la même idée, appliquée **case par case** :

```ts
function names(team: { leader: { name: string } }) { … }

names(bigTeam); // bigTeam.leader a plein de champs
```

```go
Sourced_names(struct{ Sourced_leader struct{ Sourced_name string } }{
	Sourced_leader: struct{ Sourced_name string }{
		Sourced_name: Sourced_bigTeam.Sourced_leader.Sourced_name,
	},
})
```

Pour un **tableau** d'objets (`User[]` passé à `{ name: string }[]`), il faut une **nouvelle slice** où chaque élément est converti. Là, on alloue : c'est le seul cas où l'objet temporaire coûte vraiment.

---

## 5. Où on en est

| Cas | État |
|---|---|
| Même forme exacte (`User` passé à `User`) | ✅ marche |
| Lire `arg.name` dans la fonction | ✅ `arg.Sourced_name`, accès direct |
| Objet `any` utilisé comme `User` | ✅ marche (`JSAs`, voir § 6) |
| **Objet plus grand passé à un type plus petit** (`User` → `{ name }`) | ✅ objet temporaire (D-21), test `tests/structural-objects/` |

**Une seule différence visible** : si la fonction **renvoie** l'objet reçu et qu'on l'affiche, Go montre seulement `{ name: 'John Doe' }` (l'objet temporaire), Node l'objet complet. Le programme, lui, ne peut pas lire les autres champs : TypeScript l'interdit.

---

## 6. Le cas voisin : un objet `any`

```ts
function untypedUser(): User {
	const raw: any = { age: 36, name: "ada" }; // pas d'interface, autre ordre

	return raw;
}
```

Ici, **TypeScript ne connaît pas la forme** de `raw` (c'est un `any`). Le transpileur ne peut donc pas écrire l'objet temporaire à l'avance : il le fabrique **pendant l'exécution**, avec un helper, `JSAs`, qui cherche chaque champ **par son nom** :

```go
return shard_dependencies.JSAs[User](raw) // { name: 'ada', age: 36 }
```

C'est le même principe que l'objet temporaire, mais fait à l'exécution, faute d'information à la compilation. C'est un peu plus lent (réflexion), mais rare.

| L'objet `any` contient… | JavaScript | Notre Go |
|---|---|---|
| les bons champs, dans un autre ordre | gardé tel quel | ✅ converti |
| un champ **en trop** | gardé | perdu (`User` n'a pas de case pour lui) |
| un champ du **mauvais type** (`age: "36"`) | gardé, le bug passe inaperçu | **arrêt clair** : `JSAs : valeur.age est un string, float64 attendu` |

Et pour lire `raw.name` directement sur un `any`, le helper `JSGetProperty` cherche le champ par son nom, comme JavaScript (`undefined` s'il n'existe pas).

---

## 7. Les deux cas côte à côte

| | Objet plus grand → type plus petit | Objet `any` → type précis |
|---|---|---|
| Exemple | `test(user)` | `return raw` |
| TS connaît la forme de départ ? | ✅ oui | ❌ non (`any`) |
| Quand construit-on l'objet attendu ? | **à la compilation** (objet temporaire écrit par le transpileur) | **à l'exécution** (`JSAs`) |
| Coût | une copie de cases | une copie + une recherche par nom |
| État | ✅ fait (D-21) | ✅ fait (D-20) |

---

## 8. Une précision sur `Sourced_`

On peut nous demander : « vous utilisez `Sourced_` pour récupérer les données ? »

**Non.** `Sourced_` n'est qu'un **préfixe de nommage** : tout nom venu du code TS le porte (`name` devient `Sourced_name`). Ça évite de mélanger les noms de l'utilisateur et les nôtres, et ça les rend utilisables d'un paquet Go à l'autre.

La donnée, elle, est lue **par sa position** : `arg.Sourced_name` est un accès direct à une case dont le compilateur connaît l'emplacement. Il n'y a aucune recherche par nom à l'exécution (sauf pour les `any` et les `Record`).

---

## 9. À retenir (pour l'oral)

1. **TypeScript compare par la forme** : « tu as au moins un `name`, ça me va ».
2. **Go compare par le type exact** : la boîte doit avoir exactement les mêmes cases.
3. **D'où l'objet temporaire** : on construit une petite boîte avec seulement les cases attendues, et on y copie les valeurs.
4. **Le transpileur l'écrit à la compilation**, puisque TypeScript connaît les deux formes : aucune recherche à l'exécution, juste une copie, souvent sans allocation.
5. **Pour un `any`**, la forme n'est connue qu'à l'exécution : `JSAs` fait la même chose, mais en cherchant les champs par leur nom.
6. **On ne copie jamais ce que la fonction ne peut pas voir**, et on refuse de modifier un champ, pour ne jamais diverger de JavaScript sans le dire.

**La phrase à retenir** : « TypeScript dit "assez ressemblant, ça passe" ; Go dit "exactement pareil, sinon non". Entre les deux, le transpileur fabrique la bonne boîte. »
