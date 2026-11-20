# Les problématiques étudiées

Transpileur DuploJS : TypeScript → Go. Ce dossier présente **le raisonnement** derrière le transpileur, problématique par problématique. Pour la présentation générale du projet, voir le [README principal](../README.md).

## Découpage

Les problématiques vont de la stratégie générale aux cas particuliers, puis à la mesure.

| # | Problématique | La question | Notre réponse en une phrase |
|---|---|---|---|
| [01](01-strategie-de-traduction/) | Stratégie de traduction | Comment traduire le **sens** d'un programme, pas ses mots ? | Arbre TypeScript + checker → arbre Go, sans regex, validé par comparaison des sorties. |
| [02](02-either-et-issues/) | Les `Either` | Comment représenter N issues de types différents sans union en Go ? | Un struct `EitherAny { Tag entier; Value any }`. |
| [03](03-traduction-des-types/) | Traduire les types | Que devient chaque type TS en Go ? | Une seule couche, `tsTypeToGo`, qui lit le type résolu par le checker. |
| [04](04-typage-structurel/) | Typage structurel | Un objet « plus grand » passé à un type plus petit ? | L'objet temporaire, écrit à la compilation. |
| [05](05-unions-de-types-connus/) | Unions de types connus | `string \| "admin" \| User` : comment ressortir la donnée ? | Chaque valeur est rangée sous le type exact de son membre, puis ressortie par une assertion ou un `switch` sur le type. |
| [06](06-narrowing/) | Narrowing | Un type qui change selon l'endroit ? | L'adaptateur compare les types produit, rétréci et attendu, et insère l'assertion qui manque. |
| [07](07-nombres-et-chaines/) | Nombres et chaînes | `0.1 + 0.2`, `-7 % 3`, `"😀".length`… ? | Les règles de JavaScript reproduites, dont `String(x)` vérifié sur 2 034 nombres. |
| [08](08-affichage-print/) | Affichage | Écrire exactement comme Node ? | Un `Inspect` en Go au format de `util.inspect`. |
| [09](09-ordre-d-evaluation/) | Ordre d'évaluation | `f(x, change())` lit `x` avant `change()` ? | Copier seulement ce qui peut changer, avant l'appel. |
| [10](10-fonctions-et-curryfication/) | Fonctions et curryfication | `pipe`, formes curryfiées, fonctions passées en valeur ? | `pipe` déroulé, formes curryfiées en fonctions Go littérales, callbacks enveloppés. |
| [11](11-asynchrone/) | Asynchrone | `async` / `await` sans `Promise` en Go ? | Exécution synchrone, valable car il n'y a aucune entrée-sortie. |
| [12](12-bibliotheque-duplojs/) | Bibliothèque DuploJS | Comment couvrir `DArray`, `DObject`, `DNumber`… ? | Un helper Go par fonction, ou le résultat construit à la compilation quand la forme est connue. |
| [13](13-performance-et-benchmarks/) | Performance | Est-ce vraiment plus rapide ? | Mesuré : environ 3,5 fois plus rapide et 14,8 fois moins de mémoire que Node sur le banc de l'étape 11. |

## Contenu de chaque dossier

```
NN-problematique/
├── README.md          le problème, la stratégie retenue, ses limites (court)
├── HISTORIQUE.md      les pistes explorées, les choix et leurs justifications (références D-xx)
└── exemples/
    ├── exemple.ts     un exemple TypeScript qui illustre le problème
    └── exemple.go     sa traduction, écrite et commentée à la main pour illustrer la stratégie
```

Les exemples Go sont **écrits à la main** : ce n'est pas la sortie brute du transpileur. Les noms sont simplifiés, et chaque choix est commenté. Ils suivent la même stratégie que le code généré.

## Vérifier les exemples

Chaque exemple Go doit afficher **exactement** la même chose que son exemple TypeScript, la règle que suit tout le projet. Sous WSL, depuis la racine du dépôt :

```bash
bash problematiques/verifier.sh          # les 13 dossiers
bash problematiques/verifier.sh 05       # un seul dossier
```

## Pour aller plus loin

- [DECISIONS.md](../DECISIONS.md) : chaque décision (`D-xx`) en détail, avec ce qui a été vérifié.
- [ETAPES.md](../ETAPES.md) : le découpage du travail en équipe, qui a fait quoi, ce qui reste à faire.
- [EXERCICES.md](../EXERCICES.md) : les 11 projets d'exercices et leur sortie attendue.
- `tests/` : 27 suites de tests d'exécution, chacune comparée au résultat de Node.
