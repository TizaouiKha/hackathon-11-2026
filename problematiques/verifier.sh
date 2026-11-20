#!/usr/bin/env bash
# Vérifie que chaque exemple Go écrit à la main affiche exactement la même chose
# que son exemple TypeScript. Usage (sous WSL, depuis la racine du dépôt) :
#   bash problematiques/verifier.sh            # tous les dossiers
#   bash problematiques/verifier.sh 05-unions  # un seul dossier
set -uo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
failed=0

for dir in "$root"/problematiques/*/exemples; do
	name="$(basename "$(dirname "$dir")")"
	if [ "$#" -gt 0 ] && [[ "$name" != "$1"* ]]; then
		continue
	fi

	ts_output="$(cd "$root" && node_modules/.bin/tsx "$dir/exemple.ts" 2>&1)"
	go_output="$(cd "$dir" && go run exemple.go 2>&1)"

	if [ "$ts_output" == "$go_output" ]; then
		echo "✓ $name"
	else
		echo "✗ $name"
		diff <(echo "$ts_output") <(echo "$go_output") | sed 's/^/    /'
		failed=1
	fi
done

exit "$failed"
