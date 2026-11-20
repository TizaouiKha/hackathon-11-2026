# 01 · Stratégie de traduction : d'un arbre à l'autre

## Le problème

Transformer un programme TypeScript en un programme Go **qui se comporte exactement pareil** : même ordre des calculs, mêmes erreurs, même affichage. Il ne suffit pas de remplacer des mots-clés. Il faut savoir **ce que veut dire** chaque morceau de code.

## La stratégie retenue

```
.ts ──► arbre TypeScript + checker ──► transformeurs ──► arbre Go ──► GoPrinter ──► .go
```

1. **Le compilateur TypeScript** lit le code et nous donne son arbre. Son **checker** donne le vrai sens de chaque nœud : quel symbole est appelé (même renommé à l'import), d'où il vient, et son type exact à cet endroit.
2. **Un transformeur par genre de nœud** fabrique le nœud Go équivalent. Un transformeur peut aussi produire des **instructions préparatoires**, parce qu'une seule expression TS demande parfois plusieurs instructions Go (exemple ci-dessous).
3. **L'arbre Go** est imprimé par `GoPrinter`. Le code utile à l'exécution (`Map`, `Inspect`…) est écrit une seule fois, dans un paquet partagé (`shard_dependencies`).
4. **On valide par comparaison** : le Go doit afficher exactement la même chose que Node (`check.sh`, tests d'exécution).

## L'exemple

`exemples/exemple.ts` utilise un ternaire et un import renommé (`success as ok`). `exemples/exemple.go` montre la traduction.
- **Le ternaire** n'existe pas en Go : il devient un `if / else` qui remplit une variable. C'est une instruction préparatoire.
- **`ok`** est reconnu comme `success` grâce au checker, pas grâce à son nom.

## Limites

Ce n'est pas un compilateur universel de TypeScript. Ce qu'on ne sait pas traduire fidèlement est **refusé avec un message clair**, jamais traduit de travers.
