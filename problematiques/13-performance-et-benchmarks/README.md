# 13 · Performance et benchmarks

## Le problème

Le but du transpileur est la **performance**. Encore faut-il la **mesurer**, et vérifier que nos choix (`EitherAny`, assertions, helpers génériques) ne coûtent pas plus que prévu.

## Ce qu'on a mesuré (D-28, étape 11)

**Le programme complet.** Le banc `pnpm bench:step11` (`benchmarks/step-11/`) transpile un calcul de 5 000 000 d'itérations sur des Either. Il vérifie que Node et Go affichent **exactement** le même résultat, puis mesure chaque exécutable cinq fois. Sur un Ryzen 7 5700U, avec Node 24.13.1 et Go 1.27.4 :

| Exécution | Temps moyen | Mémoire maximale moyenne |
|---|---:|---:|
| Node (`tsx`) | 4,758 s | 84,4 Mio |
| **Go compilé** | **1,350 s** | **5,7 Mio** |

Le Go est environ **3,5 fois plus rapide** et utilise **14,8 fois moins de mémoire**. C'est un relevé sur une machine et un calcul donnés, pas une garantie pour tous les programmes.

**Les briques** (`go test -bench=. -benchmem -count=5`) :

| Opération | Coût | Conclusion |
|---|---|---|
| comparer un tag entier / une chaîne littérale | ~0,5 ns, 0 allocation | pas de différence mesurable dans ce cas isolé |
| ouvrir une valeur : `.Value.(float64)` | ~1,4 ns, 0 allocation | les assertions du narrowing ne coûtent presque rien |
| ranger un `float64` dans un `any` | ~21 ns, 1 allocation | **le vrai coût** de `EitherAny`, contre ~1 ns pour un champ typé |
| `WhenIsRight` générique / déroulé | ~21 ns dans les deux cas | dérouler n'apporte rien : on garde le helper lisible |

L'analyse du compilateur (`-gcflags=-m=2`) confirme que `IsRight` et `IsLeft` sont **inlinés**.

## L'exemple

`exemples/` : le même calcul que le banc, en plus petit (100 000 itérations), pour montrer ce qui est mesuré. Les vraies mesures se lancent avec `pnpm bench:step11` sous WSL.
