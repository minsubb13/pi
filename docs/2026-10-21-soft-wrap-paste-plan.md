# Plan - soft-wrap paste unwrap and terminal soft-wrap probe (2026-10-21)

Contract: docs/2026-10-21-soft-wrap-paste-contract.md (authority). This plan is revisable.

## Work units

- [ ] U1 Paste unwrap heuristic in the editor with tests [unit: U1 scope=packages/tui/src/components/editor.ts,packages/tui/src/components/soft-wrap-paste.ts,packages/tui/test/soft-wrap-paste.test.ts oracle=cd packages/tui && node --test test/soft-wrap-paste.test.ts test/editor.test.ts]
- [ ] U2 Terminal soft-wrap probe in Ghostty and herdr-in-Ghostty [unit: U2 scope=scripts/personal/** oracle=operator copy result per environment recorded under Probe verdicts (promote / hold / reject, criteria v1)]
- [ ] U3 Build and replace the installed pi command [unit: U3 scope=docs/2026-10-21-soft-wrap-paste-plan.md after=U1 oracle=readlink -f ~/.pi/agent/install/releases/1.3.0-personal/node_modules/.bin/pi; cat ~/.pi/agent/install/current-version; pi --version; releases/1.3.0 checksum unchanged; operator paste smoke test]
- [ ] U4 Integration check, commit, push [unit: U4 scope=docs/2026-10-21-soft-wrap-paste-plan.md after=U1,U2,U3 oracle=npm run check (clean) && cd packages/tui && node --test test/soft-wrap-paste.test.ts test/editor.test.ts && git log -1 origin/personal/soft-wrap-paste]

## Notes

- U1: new `soft-wrap-paste.ts` exports a pure `unwrapSoftWrappedPaste(text, wrapWidth)`;
  `editor.ts` `handlePaste` calls it after normalization and before the large-paste check,
  passing `this.tui.terminal.columns`.
- U2: script prints a long line as full-width autowrapped rows, then after a key press
  redraws one row with `\x1b[2K`; operator copies before and after the redraw.
- U3: `npm install --ignore-scripts`, `npm run build`, then create
  `releases/1.3.0-personal/node_modules/.bin/pi` -> `<checkout>/packages/coding-agent/dist/bundle/cli.js`,
  copy `package.json`/`metadata.json` only if the launcher needs them, write `1.3.0-personal`
  to `current-version`. Rollback: `echo 1.3.0 > ~/.pi/agent/install/current-version`.

## Executor brief (design by opus, execution by gpt-6.1-sol)

All commands run in /home/remote3/dev/pi (zone root), branch personal/soft-wrap-paste.
Recorder: node /home/remote3/.pi/agent/git/github.com/minsubb13/amber/plugin/scripts/record.cjs
Run `unit start U<n>` before each unit, `unit verified U<n> --evidence '...'` after its oracle.

U1 design (`packages/tui/src/components/soft-wrap-paste.ts`, pure, no TUI imports):
- `export function unwrapSoftWrappedPaste(text: string, wrapWidth: number): string`
- Split on `\n`. Track fenced code (``` or ~~~ toggles): never join inside or at fences.
- effectiveWidth = max(wrapWidth, longest line display width) using `visibleWidth` from `../utils.ts`.
- Join line i and i+1 when ALL hold: prev non-empty; visibleWidth(prev.trimEnd()) >= effectiveWidth - 12;
  next non-empty; next leading spaces <= 2 (no tabs); next.trimStart() does not match a block start:
  list (`[-*+] `, `\d+[.)] `), heading `#`, quote `>`, table `|`, fence.
- Joining: prev.trimEnd() + sep + next.trimStart(); sep = "" if both boundary chars are CJK
  (Han/Hiragana/Katakana/Hangul) else " ". Chains: keep joining onto the accumulated line, but
  measure the *raw* previous physical line (not the accumulated one) for the width test.
- Leading margin: if every non-empty line of the paste starts with exactly 1 space (pi margin),
  strip that one space from all lines first (then the width test uses the stripped width + 1).
  Keep this rule conservative; do not strip deeper indentation.
- Single-line text returns unchanged. Output keeps original trailing newline state.

Editor hook (`editor.ts` handlePaste): after `filteredText` is computed and BEFORE the file-path
space prefix and the large-paste check, `filteredText = unwrapSoftWrappedPaste(filteredText,
this.tui.terminal.columns)`. Top-level import only. Keep the diff minimal.

Tests (`packages/tui/test/soft-wrap-paste.test.ts`, node:test like editor.test.ts), fixtures:
- pi sample (wrapWidth 105, 1-space margin, 3 rows -> 1 line):
  "Actually, the newer codex default for fullscreen_transcript is true, meaning codex now manages its own\n selection in the transcript, similar to Claude Code, rather than relying on regular terminal mode—which\n explains why copy works there. I should check which codex version the user has installed and what their\n config looks like."
- Codex sample (wrapWidth ~170, `  ` continuation, numbered item and `     - ` sub-bullet keep their own lines)
  from the operator message of 2026-10-21 (copy verbatim into the test).
- Short message "hi\nthere" stays. Bullet list stays. Fenced code with long lines stays.
- CJK join without space. Large paste: editor-level test that a >1000-char wrapped paste yields a
  marker and `getExpandedText()` returns the joined text (construct Editor as editor.test.ts does).

U2 probe (`scripts/personal/soft-wrap-probe.mjs`): print a sentence 2.5x terminal width with no
`\r\n` (terminal autowrap), print a marker line, wait for Enter, then move cursor up to the 2nd
row, `\x1b[2K` and rewrite that row's exact slice WITHOUT `\r\n` at its end (pi redraw pattern),
wait again. Hand the operator exact run steps; record verdicts per environment; hold U2 while waiting.

U3: check `node_modules` presence; `npm install --ignore-scripts`; `npm run build`; verify
`git status` clean of lockfile changes; sha256 listing of releases/1.3.0 before/after.

## Execution evidence and supervision checkpoint

2026-10-21 (GPT-6.1-sol):
- U1 implemented in `soft-wrap-paste.ts`; editor hook is one import plus one call before
  paste marker decision. The heuristic requires 1-2 spaces on continuations, preserves
  untouched lines byte-for-byte, and protects fenced/indented code and block markers.
  Unlike the initial brief, no global 1-space margin stripping: that could alter true
  indentation even when no wrap was joined. This is a conservative implementation detail.
- New tests: 20; combined with editor regression suite: 212 tests passed, 0 failed,
  elapsed 1391.912329ms (node --test, /tmp/pi-personal-u1-tests.log).
- Negative control before editor hook: 3 integration tests failed as expected, proving
  the new tests detect missing editor integration.
- Dependencies hydrated using `npm install --ignore-scripts`; no lockfile changes.
  npm reports 3 high-severity advisories in the original dependency set (not fixed here).
- First `npm run check` failed because ignored provider JSON data was absent on fresh
  checkout. `npm run hydrate:model-data` generated ignored JSON only, no tracked edits.
- Second `npm run check`: formatting, pinned deps, runtime deps, TS imports, entry graphs,
  install lock all pass. Typecheck fails in existing AI tests: fresh live catalogs lack
  historical IDs (`mimo-v2.5-pro`, Copilot `claude-opus-4.7`, `gpt-5-mini`, `gpt-5.5`,
  OpenRouter `deepseek/deepseek-r1`). No reported type errors in the paste change.
- Do not claim full check success, commit code, or replace installed pi yet.
- Opus supervision requested: decide whether reusing the exact model JSON bundled in the
  currently installed 1.3.0 is an in-scope build prerequisite, or whether to ask operator
  before using that reproducible snapshot / revising the all-green check requirement.
  Do not edit unrelated AI tests or generated catalog wrappers to hide these failures.

## Supervision decisions (opus, 2026-10-21)

- Model data: resolved in scope. Copied the exact 1.3.0 release snapshot
  (`releases/1.3.0/.../pi-ai/dist/providers/data/*.json` + `.manifest.json`) into the
  gitignored `packages/ai/src/providers/data/`. Rationale: settled decision "base v1.3.0,
  matches installed pi" - the personal build must carry the same model catalog as the
  installed release, not today's live catalog. No tracked file changed. Result:
  `check:model-data` valid, `npm run check` passed clean (verified). Do NOT re-run
  `hydrate:model-data` (it would replace the snapshot with live data again).
- Rollback baseline taken: `/tmp/pi-1.3.0-before.sha256` (14919 files, sha256 of
  `releases/1.3.0/`). Use it in U3 for the byte-for-byte comparison.
- Accepted: no global 1-space margin stripping (safer than the brief).
- Heuristic revision 1 (required before U1 verified): code-like boundaries must not join.
  Failure trace at 80 cols: `function foo(<long args>) {` (75 cols >= 68) followed by
  `  return 1;` joins into one line. Add to the join condition:
  - previous trimmed line does NOT end with `{`, `[`, `(`, `;`, `\\` (shell continuation),
    `=>`, or `,`-after-a-closing-bracket is NOT needed (keep it simple: just the five
    endings `{ [ ( ; \\` plus `=>`);
  - next trimmed line does NOT start with `}`, `]`, `)`.
  Add tests: the JS function case above stays two lines; a shell `cmd --flag \\` +
  `  --next` stays; the pi and Codex fixtures still join (Codex row 3 ends with `(one` -
  a word, so it must still join).
- Known limitation to report (no change now): if the source terminal was much narrower
  than the current pi terminal and no copied row is wider, nothing joins (safe failure).

## Probe verdicts

- Ghostty: pending operator test (not a verdict).
- herdr in Ghostty: pending operator test (not a verdict).

## Operator steps (manual evidence still required)

Run in a shell on this host from each environment (Ghostty alone, then herdr inside Ghostty):

```sh
node /home/remote3/dev/pi/scripts/personal/soft-wrap-probe.mjs
```

1. Select only `SOFT_WRAP_BEGIN` through `SOFT_WRAP_END`. Copy to a plain text editor
   (outside pi) and check whether actual newlines appear (not the editor's visual wrapping).
2. Press Enter in the probe shell; it redraws row 2. Copy the same sample again to the
   plain editor and check actual newlines again. Press Enter to exit. Do not resize.
3. Report `Ghostty: before=one line/multiple lines, after=one line/multiple lines` and
   the same for `Ghostty+herdr`. Checking by pasting into pi is invalid because the new
   paste normalization could hide the very problem the probe measures.
4. Open a NEW `pi` process (the running session still uses the old binary). Paste a long
   wrapped pi/Codex paragraph into its editor. Check the logical text using Ctrl+G in an
   external editor, or submit and inspect the saved user-message content. Visual wrapping
   inside pi's editor does not mean the newline is still stored. Preserve a separate
   pasted fenced code block and a short two-line message as controls.
5. The command still prints version `1.3.0` (no package version changes). The personal
   installation is identified by `current-version = 1.3.0-personal` and its symlink target.

Rollback if needed:

```sh
printf '1.3.0\n' > ~/.pi/agent/install/current-version
```

Build maintenance for this checkout:

```sh
npm run build:offline
```

The offline build uses the validated catalog snapshot copied from the original 1.3.0
installation. `npm run build` would refresh live catalogs and may introduce unrelated
model type/test drift. Future upstream syncing needs separate attention to this snapshot.

## Progress log
- 2026-10-21 13:58 approval: operator said "좋아. 문제 해결해보자. 진행하자. 진행은 이전과 같이 gpt-6.1-sol로 진행하고 opus는 설계 및 감독이야."
- U1 verified after Opus guard revision: 213 tests passed, 0 failed (1395.298636ms), `npm run check` clean. Commit 919e241dc. One heuristic revision used after first passing set (budget 3).
- U2 script implemented with non-TTY/resize guards, fixed-width ASCII sample and single-row erase/rewrite. Emulator/CLI tests: 3 passed, 0 failed (122.629563ms). This validates the script only, not Ghostty copy semantics. Waiting for operator's before/after copy observations in both environments. Zero probe revisions so far.
- U3 build succeeded with `npm run build:offline` (same package build sequence, without fetching live model catalogs); produced 80 bundled files, 8.8 MiB. Bundle chunk `chunk-JNQ6VHWV.js` contains unwrapSoftWrappedPaste. No tracked generated catalog/dependency edits.
- U3 installed: `current-version` is `1.3.0-personal`, symlink resolves to `/home/remote3/dev/pi/packages/coding-agent/dist/bundle/cli.js`, launcher `pi --version` exits 0 with `1.3.0` (package version unchanged). Original release's 14919 file checksums match `/tmp/pi-1.3.0-before.sha256` exactly. Waiting for the operator paste smoke test in a newly launched pi; not yet verified.
- Integration precheck passed: `npm run check` clean, editor/paste tests pass, probe tests pass. U4 not started: U2/U3 still require manual evidence. No completion signal until manual evidence and final integration/push are verified.
