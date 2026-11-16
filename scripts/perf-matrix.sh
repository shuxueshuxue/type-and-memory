#!/usr/bin/env bash
# Both arms at every size, arms alternating so drift on the machine lands on both.
set -u
cd "$(dirname "$0")/.."
out="${1:-perf/raw.jsonl}"
: > "$out"
for round in 1 2 3; do
  for chars in 0 5000 50000 500000; do
    for arm in new old; do
      nice -n 10 timeout 20m node scripts/perf.mjs "$arm" "$chars" 1 >> "$out" 2>> "${out%.jsonl}.err" \
        || echo "{\"arm\":\"$arm\",\"chars\":$chars,\"failed\":$?}" >> "$out"
    done
  done
done
