#!/usr/bin/env bash

set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
benchmark_dir="$root/benchmarks/step-11"
workload_dir="$benchmark_dir/workload"
temporary="$(mktemp -d)"

cleanup() {
	rm -rf "$temporary"
}
trap cleanup EXIT

echo "▶ Transpilation du workload"
pnpm -s build \
	--tsconfig "$workload_dir/tsconfig.json" \
	--input "$workload_dir/index.ts" \
	--output "$temporary/dist"

generated_package="$temporary/dist/index.ts/index.ts.go"
if ! grep -q '^package Sourced_index001ats$' "$generated_package"; then
	echo "Le package généré ne repose pas sur le chemin relatif attendu." >&2
	exit 1
fi

echo "▶ Compilation du workload Go"
(
	cd "$temporary/dist"
	go build -o "$temporary/workload-go" .
)

"$root/node_modules/.bin/tsx" "$workload_dir/index.ts" > "$temporary/node-output.txt"
"$temporary/workload-go" > "$temporary/go-output.txt"
diff -u "$temporary/node-output.txt" "$temporary/go-output.txt"

measure() {
	local label="$1"
	shift
	local samples="$temporary/${label}.txt"
	: > "$samples"

	for _ in 1 2 3 4 5; do
		/usr/bin/time -f "%e %M" -o "$temporary/measure.txt" "$@" > /dev/null
		cat "$temporary/measure.txt" >> "$samples"
	done

	awk -v label="$label" '
		{ elapsed += $1; rss += $2 }
		END { printf "%-8s moyenne: %.3f s, %.1f MiB RSS max\n", label, elapsed / NR, rss / NR / 1024 }
	' "$samples"
}

echo "▶ Même workload, 5 exécutions"
measure "Node" "$root/node_modules/.bin/tsx" "$workload_dir/index.ts"
measure "Go" "$temporary/workload-go"

echo "▶ Benchmarks EitherAny"
(
	cd "$benchmark_dir"
	go test -bench=. -benchmem -count=5
)

echo "▶ Analyse d'échappement du Go généré"
(
	cd "$temporary/dist"
	go build -gcflags=-m=2 ./... 2> "$temporary/escape.txt"
)
printf "Échappements signalés: %s\n" "$(grep -c 'escapes to heap' "$temporary/escape.txt" || true)"
grep -E 'EitherTag\.Is(Right|Left)|func literal does not escape|Value:.*escapes to heap' "$temporary/escape.txt" | head -20 || true
