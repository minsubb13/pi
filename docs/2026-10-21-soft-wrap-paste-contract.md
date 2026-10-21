# Contract - soft-wrap paste unwrap and terminal soft-wrap probe (2026-10-21)

No load-bearing decision absent from this contract proceeds: stop and bring the question.

Pin: start commit 71023aec1 (tag v1.3.0) on branch personal/soft-wrap-paste
Approval: minsubb13 2026-10-21 - verification state at approval: branch created from v1.3.0, no code changed; upstream editor paste path read (packages/tui/src/components/editor.ts:1260-1325), Codex reference read (codex-rs/tui/src/bottom_pane/chat_composer/paste_input.rs:152, insert_history.rs:46)

## Background

When pi runs in regular (main-screen) mode, the terminal owns mouse selection. pi
hard-wraps long lines itself (`\r\n` per visual row, plus a 1-column left margin and
trailing padding), so a copied paragraph carries a newline and leading spaces at every
wrap point. Codex in its default inline mode behaves the same way (operator sample,
2026-10-21). This run fixes the paste-into-pi side and probes whether the output side
can be fixed in Ghostty.

## Completion conditions

All conditions must hold. Partial progress is not completion.

1. Pasting text into the pi editor joins line breaks that look like terminal soft wraps
   into one logical line and strips the wrap-continuation indentation, always on (no
   setting). Real line breaks survive: blank lines, list items, fenced/indented code,
   tables, and lines clearly shorter than the wrap width. Joining runs before the
   large-paste marker decision, so the stored paste content is the joined text.
2. Unit tests cover at least: the operator's pi sample (1-space margin), the operator's
   Codex sample (2-space continuation indent), a short multi-line message that must stay
   multi-line, a bullet list, a fenced code block, and a large paste producing a marker
   whose expanded content is joined. Tests pass.
3. A terminal soft-wrap probe script exists in `scripts/personal/` and its verdict is
   recorded in the plan for two environments - Ghostty alone and herdr inside Ghostty -
   as promote / hold / reject against the criteria below (criteria v1).
4. The installed `pi` command runs this branch: `~/.pi/agent/install/current-version`
   reads `1.3.0-personal`, `~/.pi/agent/install/releases/1.3.0-personal/node_modules/.bin/pi`
   resolves to `packages/coding-agent/dist/bundle/cli.js` of this checkout, and
   `releases/1.3.0/` is left byte-for-byte untouched as the rollback target.
5. `npm run check` passes with no errors, warnings, or infos; changes are committed on
   `personal/soft-wrap-paste` and pushed to `origin` (the fork).

Probe criteria v1 (condition 3), per environment:
- promote: a long line emitted as full-width rows joined by terminal autowrap (no
  `\r\n`) copies as one line, and still does after the probe redraws one of its rows
  with pi's redraw pattern (`\x1b[2K` + rewrite).
- hold: copies as one line initially, but a redraw brings the newline back.
- reject: the newline is copied even on the initial write.

Verification (oracles): condition 1-2 - `node --test` on the new test file and the
existing `editor.test.ts` in `packages/tui`; condition 3 - operator's copy result in each
environment (manual, operator judgment), recorded in the plan; condition 4 - `readlink -f`,
`cat current-version`, `pi --version`, a checksum listing of `releases/1.3.0/` taken before
and after, plus one operator paste smoke test in the new `pi`; condition 5 - `npm run check`
full output, `git log origin/personal/soft-wrap-paste`.
Not answered: output-side fix in the renderer (`tui-main-screen.ts`) - a separate run
decided after the probe verdict; fullscreen-mode selection copy; periodic upstream
sync procedure; pasting into programs other than pi.

## Forbidden rows

- Write scope: paste unwrap logic and tests, probe script, run docs, gitignore [machine: write-scope packages/tui/src/components/editor.ts]
- Write scope (cont.) [machine: write-scope packages/tui/src/components/soft-wrap-paste.ts]
- Write scope (cont.) [machine: write-scope packages/tui/test/soft-wrap-paste.test.ts]
- Write scope (cont.) [machine: write-scope scripts/personal/**]
- Write scope (cont.) [machine: write-scope docs/2026-10-21-soft-wrap-paste-*.md]
- Write scope (cont.) [machine: write-scope .gitignore]
- Outside the checkout, write only `~/.pi/agent/install/releases/1.3.0-personal/**` and `~/.pi/agent/install/current-version`; never modify `~/.pi/agent/install/releases/1.3.0/`, `~/.pi/agent/bin/pi`, or `~/.local/bin/pi` [self-report]
- Do not run `pi update` (it would replace the personal build) [machine: bash-deny (?:^|[\n;&|])\s*pi\s+update\b]
- Do not push to upstream (earendil-works) [machine: bash-deny (?:^|[\n;&|])\s*git(?:\s+-[Cc]\s+\S+|\s+--\S+)*\s+push\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*\supstream\b]
- Do not push to main or release [machine: bash-deny (?:^|[\n;&|])\s*git(?:\s+-[Cc]\s+\S+|\s+--\S+)*\s+push\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*\s(?:HEAD:)?(?:refs/heads/)?(?:main|release)(?=\s|$)]
- Do not open issues or PRs on earendil-works/pi [self-report]
- Do not change dependencies or lockfiles; `npm install --ignore-scripts` only hydrates [self-report]
- Do not force-push [machine: bash-deny (?:^|[\n;&|])\s*git(?:\s+-[Cc]\s+\S+|\s+--\S+)*\s+push\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*(?:--force\b|--force-with-lease\b|-f\b|--mirror\b|--delete\b|\s\+[a-zA-Z0-9_/-])]
- Do not rewrite history or hard-reset [machine: bash-deny (?:^|[\n;&|])\s*git(?:\s+-[Cc]\s+\S+|\s+--\S+)*\s+(?:commit\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*--amend\b|rebase\b|filter-branch\b|filter-repo\b|reset\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*--hard\b)]
- Specify files explicitly when staging or committing [machine: bash-deny (?:^|[\n;&|])\s*git(?:\s+-[Cc]\s+\S+|\s+--\S+)*\s+(?:commit|add)\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*\s(?:-[aA]\b|-am\b|--all\b|\.(?=\s|$)|:/(?=\s|$))]

## Budget
One working session. Heuristic tuning: at most 3 revise-and-test rounds after the first
passing test set; probe: at most 2 script revisions. On reaching it: INCOMPLETE - RESUME
REQUIRED (resume: open `docs/2026-10-21-soft-wrap-paste-plan.md`, continue from the first
unchecked unit on branch personal/soft-wrap-paste in /home/remote3/dev/pi).

## Settled decisions
- Base: tag v1.3.0 (matches installed pi), personal branch `personal/soft-wrap-paste` (minsubb13 2026-10-21)
- Repository: fork `git@github.com:minsubb13/pi.git` as `origin`, earendil-works as `upstream`; periodic upstream sync is the operator's ongoing practice, not this run (minsubb13 2026-10-21)
- Scope split: paste-side unwrap (B) is implemented now; output-side soft wrap (A) is only probed now, implemented in a later run if promoted (minsubb13 2026-10-21)
- Unwrap is always on, no setting (minsubb13 2026-10-21)
- Unwrap uses the recommended heuristic (auto-detect), not a separate paste shortcut (minsubb13 2026-10-21)
- Full replacement of the `pi` command via a `1.3.0-personal` release directory linking to this checkout's build; rollback is writing `1.3.0` back to `current-version` (minsubb13 2026-10-21)
- `npm run build` and `npm install --ignore-scripts` are allowed for the replacement (implied by full replacement, minsubb13 2026-10-21)
- Commit per unit and push the branch to the fork (minsubb13 2026-10-21)
- Probe environments: Ghostty (primary), herdr inside Ghostty (secondary) (minsubb13 2026-10-21)
- No independent review (minsubb13 2026-10-21)

## Discretion
- Heuristic thresholds: a break is a soft wrap when the previous line's display width is
  within a small slack (default 12 columns) of the wrap width - terminal columns, falling
  back to the longest line in the paste when it is wider - and the next line starts with
  at most 2 spaces of indentation and does not look like a list item, heading, table row,
  quote, or code fence; inside fenced code nothing is joined. Join with a single space
  for Latin text, no space between CJK characters. Tunable; reversible in one file.
- Logic lives in a new `soft-wrap-paste.ts` with a minimal hook in `editor.ts`, to keep
  upstream merges small.
- Probe script language and exact output pattern.

## Standing rules

- End the run with the completion report (`references/reports.md`) once after the completion signal: show the deliverable, state what changed where and what verified it, and explain it for a reader with no context. The signal never replaces the report [self-report]
- Before the signal, semantically re-check the request, every required condition, current artifacts, and validation evidence. Missing, failed, unsuitable, or stale evidence means not complete; after any edit during re-check, re-validate and re-check [self-report]
- Incomplete, blocked, waiting, and status-only turns run no completion signal; the signal declares the contracted work itself complete, never an assessment, report, or attempt [self-report]
- Pass the re-check to `record.cjs done --review "<evidence summary>" --goal "<goal-test result>" --summary "<summary>"` (last tool call; no marker line in the message). On pass, S2 removes the pointer and `progress.json` [hook: S2]
- Numbers and claims carry provenance (verified / quoted / unverified)
- Plan units transition only via `record.cjs unit` (`.amber/progress.json`); announce any stop with open units via `amber:mark hold`. Units run serially in the main session [hook: E1, S2]
- Follow the repository's AGENTS.md (no inline imports, erasable TS only, `npm run check` after code changes, tui tests via `node --test`) [self-report]

## Question handling
Default: on a discovery outside the contract, full stop plus a stop report (`references/reports.md`).
Waiting for the operator's probe copy results is a legitimate hold on U2 (`hold - U2 - operator copy test`).

## Carry-over (filled at completion)
- Left behind: copying pi's own output into other programs (TextEdit etc.) still carries a newline per visual row - output-side fix not in this run. Model catalog snapshot copied from installed 1.3.0 into gitignored `packages/ai/src/providers/data/`; rebuild with `npm run build:offline`, not `npm run build`. Upstream sync procedure not defined.
- Waiting (what waits on whose judgment): operator decides whether to open the output-side renderer run (probe: Ghostty promote, herdr-in-Ghostty hold).
- Next action: if opened, scope a renderer change in `tui-main-screen.ts` that emits a logical line as autowrapped full-width rows and redraws a wrapped line contiguously from its first row (herdr needs this).
