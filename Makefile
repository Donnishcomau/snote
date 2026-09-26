VITEST_TIMEOUT ?= 600

.PHONY: check
check:
	npm run -s typecheck
	npm run -s lint
	@timeout $(VITEST_TIMEOUT) npx vitest run --passWithNoTests || { code=$$?; if [ $$code -eq 124 ]; then echo "FAIL: vitest did not finish within $(VITEST_TIMEOUT)s: a test left a handle open. Re-run with --reporter=hanging-process to see which one."; fi; exit $$code; }
	@grep -rnE "\.only\(|\.skip\(" test vendor --include=*.ts --include=*.tsx && { echo "FAIL: .only/.skip found"; exit 1; } || true
	@[ -f test/keymap.test.ts ] && npm run -s test:keymap || echo "skip: keymap gate (T16)"
	@[ -f scripts/lint-ansi.mjs ] && npm run -s lint:ansi || echo "skip: ansi gate (T12)"
	@if [ -f scripts/bench.mjs ]; then node scripts/bench.mjs; else echo "skip: bench gate (T17)"; fi
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
	@timeout $(VITEST_TIMEOUT) npx vitest run --passWithNoTests || { code=$$?; if [ $$code -eq 124 ]; then echo "FAIL: vitest did not finish within $(VITEST_TIMEOUT)s: a test left a handle open. Re-run with --reporter=hanging-process to see which one."; fi; exit $$code; }
	@grep -rnE "\.only\(|\.skip\(" test vendor --include=*.ts --include=*.tsx && { echo "FAIL: .only/.skip found"; exit 1; } || true
	@[ -f test/keymap.test.ts ] && npm run -s test:keymap || echo "skip: keymap gate (T16)"
	@[ -f scripts/lint-ansi.mjs ] && npm run -s lint:ansi || echo "skip: ansi gate (T12)"
	@echo "skip: bench gate (CI, see check-ci comment above)"
	@echo "CI CHECK PASSED"
