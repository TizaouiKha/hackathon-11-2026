# Historique · Les `Either`

## 1. Comment identifier l'issue ? (D-09.1, 17/11, décidé en équipe)

| Option | Points forts | Points faibles | Verdict |
|---|---|---|---|
| A. Une interface Go + une struct par variante | idiomatique | allocations sur le tas, test dynamique, beaucoup de types à générer | ❌ |
| B. L'information en chaîne (code de départ) | lisible au débogage | comparaison de chaînes, 16 octets, faute de frappe vue seulement à l'exécution | ❌ |
| **C. Un tag entier** | 1 octet, faute de frappe vue **à la compilation** | constantes et tables à générer | ✅ |

**Mesure après coup (D-28)** : dans un microbenchmark isolé, tag entier et chaîne littérale coûtent tous deux environ 0,5 ns. L'entier est gardé pour sa taille fixe, ses tables et la vérification à la compilation, pas pour une vitesse qu'on n'a pas pu prouver.

## 2. Quel type pour la valeur ?

- **Première version (D-09.2)** : `Either[T]` quand toutes les issues portent le même type, `Either2[R, L]` quand le succès et l'erreur diffèrent. Ça suffisait pour les projets 01 à 10.
- **Problème rencontré** : DuploJS autorise **N** issues de N types différents. Avec `Either` / `Either2`, il fallait une règle de choix, des conversions entre les deux formes, et chaque helper en deux versions.
- **Décision D-18 (18/11, validée avec le prof)** : un seul type, `EitherAny { Tag; Value any }`. Côté Go, on ne revérifie pas le type de la valeur, puisque TypeScript l'a déjà fait. On l'ouvre par une assertion là où on la lit.

## 3. Le cas `whenIsRight` (D-16)

`whenIsRight(r, f)` ne renvoie **pas** un Either : en cas de succès, il renvoie directement `f(valeur)`, une valeur brute. On a ajouté un **tag réservé `TagValue`** (« valeur brute »), plutôt qu'un nouveau type `ValueOrEither`, qui aurait doublé tous les helpers et tout l'affichage.

## 4. Helpers génériques ou déroulés ? (D-09.3, mesuré en D-28)

- **Choix** : des helpers génériques écrits une fois en Go, lisibles et testables à part.
- **Alternative** : dérouler chaque appel à la compilation, réputé plus rapide.
- **Mesure (étape 11)** : `WhenIsRight` générique et déroulé coûtent le même temps et les mêmes allocations, et Go inline déjà `IsRight`. Les helpers génériques restent.

## 5. Les constructeurs

`DEither.success(x)` devient un **littéral de struct** (`EitherAny{Tag: …, Value: x}`), pas un appel de fonction : il ne coûte rien à l'exécution.
