# Historique · Stratégie de traduction

## Pistes explorées

| Piste | Idée | Verdict |
|---|---|---|
| **Remplacement de texte** (regex) | Réécrire le source TS en Go par motifs | ❌ **Écartée**. Une regex ne comprend ni les types, ni la portée des noms, ni les imports renommés : `import { success as ok }` puis `ok(x)` serait incompréhensible. |
| **Écrire du texte Go directement** depuis l'arbre TS | Chaque transformeur renvoie une chaîne Go | ❌ **Écartée**. Impossible de vérifier ou de retravailler le résultat (adapter un type, insérer une copie), et la mise en forme serait à gérer partout. |
| **Arbre TS → arbre Go** | Chaque transformeur fabrique des nœuds Go, imprimés à la fin | ✅ **Retenue** |

## Choix et justifications

- **S'appuyer sur le checker TypeScript (17/11).** Le programme est supposé déjà valide en TS : on ne le revérifie pas, on **interroge** le checker pour le type exact de chaque nœud, le vrai symbole appelé et son module d'origine. C'est ce qui permet de reconnaître `DEither.success` même renommé.
- **Garder les fabriques de l'arbre Go fournies (D-03).** Le code de départ avait déjà une bibliothèque de nœuds Go (`src/go/AST/`) et un printer. Les réécrire n'apportait rien. On a ajouté un petit module de construction (`goBuilder`) pour écrire les helpers Go plus lisiblement (D-19).
- **Les instructions préparatoires (D-06, étape 5).** Une expression TS (ternaire, `pipe`, appel imbriqué) demande parfois plusieurs instructions Go. Chaque transformeur renvoie donc `before` (les instructions à placer avant) et `result` (l'expression). Un helper commun, `transformPrepared`, met un résultat dans une variable quand c'est nécessaire.
- **Un paquet Go partagé (« shared dependencies »).** Les fonctions utiles à l'exécution sont écrites une fois et importées par tous les fichiers générés, au lieu d'être recopiées dans chaque fichier.
- **Valider par la sortie, pas par la compilation (D-14).** Un Go qui compile peut quand même se tromper. `check.sh` exécute le TS et le Go, puis compare leurs sorties avec `diff`. Les tests d'exécution font pareil, brique par brique.
- **Environnement : WSL (D-01).** Le build sous Windows natif posait des problèmes de chemins. Tout se lance sous WSL.

## Ce qu'on a appris

Le plus gros risque n'était pas la syntaxe, mais le **sens** : types, ordre d'évaluation, affichage. Chaque problématique suivante en est un cas particulier.
