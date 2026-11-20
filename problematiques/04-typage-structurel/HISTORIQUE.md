# Historique · Typage structurel

## Le déclencheur

Question du prof (19/11) : « `test(user)` avec `function test(arg: { name: string })` : faut-il un objet temporaire ? » Notre Go ne compilait pas : l'adaptateur ne savait convertir qu'un `any` vers un objet typé.

## Pistes explorées

| Piste | Idée | Verdict |
|---|---|---|
| **Refuser** | Erreur « types différents » | ❌ Le cas est courant en TypeScript : c'est le principe même du typage structurel. |
| **Interfaces Go avec accesseurs** | Chaque objet implémente `GetName()`, et la fonction attend une interface | ❌ Il faudrait générer des méthodes pour chaque champ de chaque objet, et chaque lecture deviendrait un appel indirect. Lourd et plus lent. |
| **Copie par réflexion à l'exécution** (`JSAs`) | Recopier les champs en les cherchant par leur nom | ❌ ici. La réflexion coûte à chaque appel, alors que les deux formes sont **connues à la compilation**. On la garde seulement pour les objets `any`, dont la forme est inconnue (D-20). |
| **Objet temporaire écrit à la compilation** | Le transpileur écrit le littéral du struct attendu, champ par champ | ✅ **Retenue (D-21)** |

## Justification

- **Aucun coût caché** : une copie de cases, en général sur la pile, sans allocation pour un objet simple.
- **Aucune erreur possible à l'exécution** : TypeScript a déjà vérifié que chaque champ existe.
- **On ne copie que ce que la fonction peut voir** : TypeScript lui interdit de lire le reste.

## Ce qu'on a découvert en route

- **La source doit être évaluée une seule fois** : `nameOf(makeUser())` appellerait sinon `makeUser()` une fois par champ. Un test compte les appels (`evaluatedOnce`).
- **La déstructuration piège l'adaptateur** : pour `const { name: label } = user`, TypeScript donne comme type « attendu » la forme du motif (`{ name: any }`). On ne la traite donc pas comme une cible (correctif de D-21).
- **Un objet littéral est déjà construit au type attendu** : l'adaptateur ne doit pas le reconvertir, sinon il y a double conversion et le Go ne compile pas (correctif trouvé avec D-24).

## Différences assumées

- L'objet renvoyé sous le type plus petit ne garde que ses champs. Documenté, et vérifié tel quel par `tests/structural-objects`.
- La modification de champ est refusée (D-19) : Go copie les structs, JS partage les objets. Il faudrait des pointeurs, une décision qui reste à prendre en équipe.
