#!/usr/bin/env bash
# Usage : ./.commands/test-runtime.sh          (tous les tests de tests/)
#         ./.commands/test-runtime.sh either   (un seul test)
#
# Un test d'exécution = un dossier tests/<nom>/ contenant :
#   - tsconfig.json, index.ts et les fichiers .ts à transpiler ;
#   - check/main.go : un programme Go écrit à la main qui appelle le Go
#     transpilé et vérifie les valeurs (il doit sortir avec un code ≠ 0 en cas d'échec).
# Le script transpile tests/<nom>/ dans tests/<nom>/dist/, y copie check/,
# puis lance `go vet` et `go run ./check`.
#
# Variante « générateur » : si tests/<nom>/check.ts existe, il est lancé seul
# avec tsx (alias du transpileur disponibles). Il génère et exécute lui-même
# son Go — utile pour tester une shared dependency sans TypeScript à transpiler.

set -uo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$#" -gt 0 ]; then
	tests=("$@")
else
	tests=()
	for dir in "$root"/tests/*/; do
		tests+=("$(basename "$dir")")
	done
fi

failed=0

for name in "${tests[@]}"; do
	dir="$root/tests/$name"
	echo "▶ Test d'exécution : $name"

	if [ -f "$dir/check.ts" ]; then
		if (cd "$root" && node_modules/.bin/tsx --tsconfig tsconfig.app.json "tests/$name/check.ts"); then
			echo "✓ $name"
		else
			echo "✗ $name"
			failed=1
		fi
		continue
	fi

	if ! (cd "$root" && pnpm -s build --tsconfig "tests/$name/tsconfig.json" --input "tests/$name/index.ts" --output "tests/$name/dist"); then
		echo "✗ $name : transpilation échouée"
		failed=1
		continue
	fi

	cp -r "$dir/check" "$dir/dist/check"

	if (cd "$dir/dist" && go vet ./... && go run ./check); then
		echo "✓ $name"
	else
		echo "✗ $name"
		failed=1
	fi
done

exit "$failed"
