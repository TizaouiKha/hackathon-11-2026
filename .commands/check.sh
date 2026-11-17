#!/usr/bin/env bash
# Usage : ./.commands/check.sh 03
# Transpile le projet NN, compile et exécute le Go, puis compare sa sortie
# à celle du TypeScript d'origine (la référence).

set -uo pipefail

project="${1:?usage: check.sh <numéro de projet, ex. 03>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/projects/$project"
tmp="$(mktemp -d)"

echo "▶ Transpilation de projects/$project"
(cd "$root" && pnpm -s build --tsconfig "projects/$project/tsconfig.json" --input "projects/$project/index.ts" --output "projects/$project/dist") || { echo "✗ build TS → Go échoué"; exit 1; }

echo "▶ Compilation Go"
(cd "$dir/dist" && go vet ./... && go build -o "$tmp/program" .) || { echo "✗ le Go généré ne compile pas"; exit 1; }

echo "▶ Exécution et comparaison"
(cd "$dir" && "$root/node_modules/.bin/tsx" index.ts) > "$tmp/expected.txt" 2>&1
"$tmp/program" > "$tmp/actual.txt" 2>&1

if diff -u "$tmp/expected.txt" "$tmp/actual.txt"; then
	echo "✓ projet $project : sortie identique à TypeScript"
else
	echo "✗ projet $project : sortie différente (- attendu TS / + obtenu Go)"
	exit 1
fi
