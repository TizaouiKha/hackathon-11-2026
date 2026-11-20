# 04 · Typage structurel contre typage nominal : l'objet temporaire

## Le problème

En TypeScript, un objet « convient » s'il a **au moins** les champs demandés. Une fonction qui attend `{ name: string }` accepte un `User` complet (`{ id, name, email }`).

En Go, `struct{ id; name; email }` et `struct{ name }` sont **deux types différents** : le compilateur refuse de passer l'un pour l'autre.

## La stratégie retenue : l'objet temporaire (D-21)

Les deux formes sont connues **à la compilation**. Le transpileur écrit donc lui-même la copie des champs attendus :

```go
greet(struct{ Name string }{Name: user.Name})
```

- C'est une simple copie de cases, sans recherche ni réflexion à l'exécution.
- **Objets imbriqués** : même règle, récursivement.
- **Listes d'objets** (`User[]` passé à `{ name: string }[]`) : une nouvelle slice, élément par élément.
- **La source n'est évaluée qu'une fois** : si c'est un appel (`makeUser()`), son résultat est d'abord rangé dans une variable.

## L'exemple

`exemples/` : un `User` passé à une fonction qui n'attend que `{ name }`, seul puis dans une liste.

## Limites assumées

- **Un objet renvoyé sous le type plus petit** ne garde que les champs de ce type. S'il est affiché, Go montre `{ name: 'Ada' }`, là où Node montre l'objet complet. Le programme, lui, ne peut pas lire les autres champs : TypeScript l'interdit.
- **Modifier un champ d'objet** (`obj.x = 1`) est refusé : un struct Go est **copié**, un objet JS est **partagé**. La modification serait perdue sans prévenir.
