VITEST_TIMEOUT ?= 600

.PHONY: check
check:
	npm run -s typecheck
	npm run -s lint
	@timeout $(VITEST_TIMEOUT) npx vitest run --passWithNoTests || { code=$$?; if [ $$code -eq 124 ]; then echo "FAIL: vitest did not finish within $(VITEST_TIMEOUT)s: the suite was too slow (machine load) or a test left a handle open. Re-run with --reporter=hanging-process to see which one."; fi; exit $$code; }
	@grep -rnE "\.only\(|\.skip\(" test vendor --include=*.ts --include=*.tsx && { echo "FAIL: .only/.skip found"; exit 1; } || true
	@if [ -f test/keymap.test.ts ]; then npm run -s test:keymap; else echo "skip: keymap gate (T16)"; fi
	@if [ -f scripts/lint-ansi.mjs ]; then npm run -s lint:ansi; else echo "skip: ansi gate (T12)"; fi
	@if [ -f scripts/bench.mjs ]; then node scripts/bench.mjs; else echo "skip: bench gate (T17)"; fi
	@if [ -f scripts/gates.sh ]; then bash scripts/gates.sh; else echo "skip: repo test gates (scripts/gates.sh is not exported)"; fi
	@echo "CHECK OK"

# CI target: identical to `check` except it skips the startup-time bench
# (scripts/bench.mjs). That bench has a ~150-200ms ceiling tuned against a
# quiet dev machine; shared/throttled CI runners can miss it under
# noisy-neighbour load even when nothing regressed, which would make CI
# flaky through no fault of the change under test. Perf is still enforced on
# every local `make check`, which runs the real target above unskipped.
.PHONY: check-ci
check-ci:
	npm run -s typecheck
	npm run -s lint
	@timeout $(VITEST_TIMEOUT) npx vitest run --passWithNoTests $(if $(SHARD),--shard=$(SHARD)) $(if $(SHARD_REPORT),--reporter=default --reporter=json --reporter=./test/helpers/headroom-reporter.ts --outputFile.json=$(SHARD_REPORT)) || { code=$$?; if [ $$code -eq 124 ]; then echo "FAIL: vitest did not finish within $(VITEST_TIMEOUT)s: the suite was too slow (machine load) or a test left a handle open. Re-run with --reporter=hanging-process to see which one."; fi; exit $$code; }
	@grep -rnE "\.only\(|\.skip\(" test vendor --include=*.ts --include=*.tsx && { echo "FAIL: .only/.skip found"; exit 1; } || true
	@if [ -f test/keymap.test.ts ]; then npm run -s test:keymap; else echo "skip: keymap gate (T16)"; fi
	@if [ -f scripts/lint-ansi.mjs ]; then npm run -s lint:ansi; else echo "skip: ansi gate (T12)"; fi
	@echo "skip: bench gate (CI, see check-ci comment above)"
	@if [ -f scripts/gates.sh ]; then bash scripts/gates.sh; else echo "skip: repo test gates (scripts/gates.sh is not exported)"; fi
	@echo "CI CHECK PASSED"

# Fast gate: typecheck, lint and only the tests affected by the uncommitted change (vitest --changed follows
# imports); the full suite is `make check-ci`.
# check-fast compares with the merge base of origin/main, so a committed branch still selects its tests;
# vitest --changed <ref> also takes uncommitted and untracked files. Falls back to HEAD without origin/main.
FAST_BASE = $(shell git merge-base HEAD origin/main 2>/dev/null || echo HEAD)
# GNU make 3.81 (the macOS default) reads a literal hash inside a function call as a comment and stops; 4.3+ reads it
# literally. HASH holds the character for both (#231). 3.81 also echoes a recipe continuation line's leading tab, which
# 4.x strips, so continuation lines start with spaces only (test/build/makefile-portable.test.ts).
HASH := \#
.PHONY: check-fast
check-fast:
	npm run -s typecheck
	npm run -s lint
	@if [ -f scripts/shell-gate.sh ]; then bash scripts/shell-gate.sh; else echo "skip: shell gate (not in the public export)"; fi
	@timeout $(VITEST_TIMEOUT) npx vitest run --changed $(FAST_BASE) --passWithNoTests $(KNOWN_FLAKY_EXCLUDES)
	@# a change that can grow the bundle runs every test that builds it (size caps live in several; vitest --changed cannot see them)
	@if { git diff --name-only $(FAST_BASE); git ls-files --others --exclude-standard; } | grep -qE '^(src|vendor)/|^package(-lock)?\.json$$|^scripts/build\.mjs$$'; then \
  timeout $(VITEST_TIMEOUT) npx vitest run $$(grep -rlE "scripts/build\.mjs" test --include='*.test.ts' --include='*.test.tsx'); fi
	@grep -rnE "\.only\(|\.skip\(" test vendor --include=*.ts --include=*.tsx && { echo "FAIL: .only/.skip found"; exit 1; } || true
	@if [ -f test/keymap.test.ts ]; then npm run -s test:keymap; else echo "skip: keymap gate (T16)"; fi
	@if [ -f scripts/lint-ansi.mjs ]; then npm run -s lint:ansi; else echo "skip: ansi gate (T12)"; fi
	@echo "FAST GATE PASSED (the full suite is make check-ci)"

# The steps of check/check-ci that follow vitest.
.PHONY: check-post
check-post:
	@grep -rnE "\.only\(|\.skip\(" test vendor --include=*.ts --include=*.tsx && { echo "FAIL: .only/.skip found"; exit 1; } || true
	@if [ -f test/keymap.test.ts ]; then npm run -s test:keymap; else echo "skip: keymap gate (T16)"; fi
	@if [ -f scripts/lint-ansi.mjs ]; then npm run -s lint:ansi; else echo "skip: ansi gate (T12)"; fi
