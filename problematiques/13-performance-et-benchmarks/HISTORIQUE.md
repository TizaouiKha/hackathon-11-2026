# Historique · Performance

## Principe suivi

C'est la démarche du cours : **d'abord traduire correctement, puis mesurer, puis spécialiser seulement ce que la mesure justifie**. Plusieurs choix ont été pris tôt « pour la performance » ; l'étape 11 les a vérifiés après coup.

## Les optimisations envisagées, et ce que la mesure a dit

| Idée | Attente | Mesure | Décision |
|---|---|---|---|
| **Tag entier** plutôt que chaîne (D-09.1) | comparaison plus rapide | ~0,5 ns dans les deux cas | ✅ gardé, mais pour sa taille fixe, ses tables et la vérification à la compilation, **pas** pour la vitesse |
| **Dérouler `WhenIsRight`** au lieu d'un helper générique | moins d'appels | même temps, mêmes allocations | ❌ on garde le helper générique, plus lisible |
| **Helpers génériques** (D-09.3) | coût d'un appel | Go inline déjà `IsRight` / `IsLeft` | ✅ confirmé |
| **Assertions** `.Value.(T)` (D-18) | crainte d'un coût caché | ~1,4 ns, 0 allocation | ✅ confirmé |
| **Valeur dans `any`** (D-18) | allocation pour un `float64` | ~21 ns, 1 allocation | ⏸️ **le principal coût restant**. Piste : une case `Num float64` à côté de `Value any` dans `EitherAny`, pour éviter le boxing des nombres. Pas faite : il faudrait la propager dans tous les helpers. |
| **Supprimer les variables temporaires** (ordre d'évaluation, voir [09](../09-ordre-d-evaluation/)) | Go plus court | relecture du Go généré : aucune suppression générale n'est sûre ni justifiée par les mesures | ✅ gardées : elles protègent l'ordre d'évaluation de JS |

## Choix faits pour la performance dès la conception

- **Les constructeurs** (`success`, `left`) sont des littéraux de struct, pas des appels.
- **`MatchInformation`** range ses handlers **par numéro de tag** dans une slice : accès direct, pas de map.
- **Les tables des tags** sont des tableaux fixes `[256]`, sans allocation.
- **L'objet temporaire** (voir [04](../04-typage-structurel/)) et `DObject` sont construits à la compilation, sans réflexion.
- **Les unions de types connus** (voir [05](../05-unions-de-types-connus/)) n'utilisent plus la réflexion : seulement des assertions et des `switch` sur le type.

## Limite de la mesure

Les chiffres décrivent **une machine et un calcul**. Les valeurs absolues varient avec la charge de la machine ; c'est le rapport Node / Go et l'absence d'allocation sur les assertions qui comptent.
