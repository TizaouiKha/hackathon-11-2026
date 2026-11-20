# Historique · Le narrowing

## Pistes explorées

| Piste | Idée | Verdict |
|---|---|---|
| **Déclarer la variable avec le type rétréci** | `var value float64` | ❌ Impossible : c'est la **même** variable, qui a plusieurs types selon la branche. |
| **Une nouvelle variable par branche** | `valueAsNumber := value.(float64)` en tête de chaque bloc rétréci | ❌ Il faudrait suivre tout le flot de contrôle du programme (if, switch, retours anticipés, `&&`…). Le checker le fait déjà, mieux que nous. |
| **Adapter à chaque lecture** | À chaque expression, comparer le type produit, le type rétréci et le type attendu, puis insérer l'assertion ou la conversion qui manque | ✅ **Retenue (D-18.2)** |

## Justification

- **Le checker a déjà fait le travail difficile** : il connaît le type à chaque endroit. On lui demande seulement : « que produit le Go ici ? » et « que faut-il ici ? ».
- **Un seul endroit** décide de toutes les conversions : `adaptExpression`. Les transformeurs n'ont pas à s'en soucier, puisque leur résultat est adapté automatiquement.

## Ce qu'on a appris en route

- **Le type « produit » d'une variable, c'est sa déclaration**, pas son type rétréci. Une première version prenait le type rétréci et oubliait l'assertion.
- **Un accès à un champ (`user.name`) se comporte comme une variable** : son type Go est celui de la **déclaration** du champ (D-19).
- **L'adaptateur est devenu le point d'entrée de plusieurs problématiques** : l'objet temporaire (04), les unions (05) et l'élargissement vers un Either (02) y passent tous.
- **Deux pièges corrigés** : la forme d'un motif de déstructuration n'est pas un type attendu, et un objet littéral est déjà construit au bon type, donc il ne faut pas le reconvertir.

**Vérifié** : `tests/narrowing`, et 86 cas de `tests/language-extended`, dont le narrowing après `if (DEither.isLeft(x))`.
