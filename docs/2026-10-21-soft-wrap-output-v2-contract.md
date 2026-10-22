# Contract v2 - soft-wrap copy: pi paragraphs copy without newlines in fullscreen and regular mode (2026-10-22)

No load-bearing decision absent from this contract proceeds: stop and bring the question.

Pin: start commit 4cf243307 on branch personal/soft-wrap-output
Approval: minsubb13 2026-10-22 - verification state at approval: supersedes docs/2026-10-21-soft-wrap-output-contract.md (frozen, kept as record). Carried over and verified there: probe v2 Ghostty results; regular-mode renderer change (227 tests pass, npm run check clean, commits 77392e425, b4955a1ae). Smoke test failed because pi 1.3.0 defaults to fullscreen mode (`packages/coding-agent/src/core/settings-defaults.ts:62`), where pi builds copied text itself with a newline per row (`packages/tui/src/tui-alt-screen.ts:1459`).

## Background

pi has two terminal modes. Regular mode writes into the terminal's scrollback and the
terminal owns mouse selection; the previous contract changed its renderer so Markdown
paragraph rows join by terminal autowrap (Ghostty copies them as one line, with extra spaces
at joins). Fullscreen mode (the 1.3.0 default, used by the operator) runs in the alternate
screen with autowrap off; a mouse drag is handled by pi, which copies the selected rows
joined with `\n`. The operator's smoke test ran in fullscreen mode, so nothing changed.

## Completion conditions

All conditions must hold. Partial progress is not completion.

1. Fullscreen copy: when pi copies a mouse selection in fullscreen mode, rows that are
   soft-wrap continuations of one Markdown paragraph row (assistant text, thinking, user
   messages, other Markdown-based messages) are joined without a newline. At each join the
   right padding and the continuation row's left margin are removed, and one space is
   inserted only when the wrap broke at whitespace (no space when it broke inside a long
   token or between CJK characters). Real line breaks, list items, code blocks, tables,
   quotes, headings, and separate paragraphs keep their newlines. Partial selections that
   start or end mid-row follow the same rule. Selections outside Markdown paragraphs copy
   exactly as today.
2. Regular mode keeps the previous contract's behavior (autowrapped paragraph rows,
   whole-logical-line redraw, stale-join reset, viewport-top redraw for tall paragraphs,
   `PI_TUI_SOFT_WRAP=0` opt-out).
3. `PI_TUI_SOFT_WRAP=0` also turns the fullscreen join off (copy exactly as today).
4. Tests in `packages/tui` pass and cover at least: fullscreen copy of a wrapped paragraph
   gives one line with single spaces; CJK paragraph joins without spaces; a long unbroken
   token joins without a space; two paragraphs, a list, a code block, and a literal line
   break keep their newlines; a partial selection across a join; the opt-out; plus the
   previous contract's regular-mode tests and the existing alt-screen, renderer, Markdown,
   and wrap tests (exact list in the plan oracle).
5. The installed personal `pi` (`current-version` = `1.3.0-personal`, symlink to this
   checkout's bundle) runs the new build; `releases/1.3.0/` matches
   `/tmp/pi-1.3.0-before.sha256`; operator smoke test in a new pi in its default
   fullscreen mode: dragging over a multi-row assistant paragraph and pasting into a plain
   text editor gives one line, in Ghostty and in herdr; two paragraphs stay separate; no
   wrong joins.
6. Independent review: `docs/2026-10-21-soft-wrap-output-v2-review.md` by Claude Opus
   (fresh read-only context via `claude -p`), covering both the regular-mode renderer
   change and the fullscreen copy change; no MUST-FIX open, every finding disposed.
7. `npm run check` passes with no errors, warnings, or infos; changes are committed on
   `personal/soft-wrap-output` and pushed to `origin` (the fork).

Verification (oracles): conditions 1-4 - `node --test` on the plan's test list in
`packages/tui`; condition 5 - `cat current-version`, `readlink -f`, `pi --version`,
`sha256sum -c` in `releases/1.3.0`, operator smoke test; condition 6 - the review verdict
file; condition 7 - `npm run check` full output, `git log -1 origin/personal/soft-wrap-output`.
Not answered: terminal-native selection inside fullscreen mode (shift+drag, alternate
screen with autowrap off); keyboard-driven copy commands such as `/copy`; tool output and
other non-Markdown text; upstream contribution; periodic upstream sync.

## Forbidden rows

- Write scope: fullscreen renderer [machine: write-scope packages/tui/src/tui-alt-screen.ts]
- Write scope (cont.): fullscreen layout, only if the marker must survive layout [machine: write-scope packages/tui/src/layout.ts]
- Write scope (cont.): regular renderer [machine: write-scope packages/tui/src/tui-main-screen.ts]
- Write scope (cont.): TUI base [machine: write-scope packages/tui/src/tui.ts]
- Write scope (cont.): wrap helper [machine: write-scope packages/tui/src/utils.ts]
- Write scope (cont.): Markdown component [machine: write-scope packages/tui/src/components/markdown.ts]
- Write scope (cont.): soft-wrap module [machine: write-scope packages/tui/src/soft-wrap-output.ts]
- Write scope (cont.): package exports if needed [machine: write-scope packages/tui/src/index.ts]
- Write scope (cont.): tests [machine: write-scope packages/tui/test/**]
- Write scope (cont.): probe scripts [machine: write-scope scripts/personal/**]
- Write scope (cont.): run docs (v1 and v2 share this prefix) [machine: write-scope docs/2026-10-21-soft-wrap-output-*.md]
- Outside the checkout, write only `~/.pi/agent/install/releases/1.3.0-personal/**` and `~/.pi/agent/install/current-version`; never modify `~/.pi/agent/install/releases/1.3.0/`, `~/.pi/agent/bin/pi`, `~/.local/bin/pi`, or `~/.pi/agent/settings.json` [self-report]
- Do not edit the superseded v1 contract file [self-report]
- Build with `npm run build:offline`, never `npm run build` or `npm run hydrate:model-data` [machine: bash-deny (?:^|[\n;&|])\s*npm\s+run\s+(?:build|hydrate:model-data)(?=\s|$)]
- Do not run `pi update` (it would replace the personal build) [machine: bash-deny (?:^|[\n;&|])\s*pi\s+update\b]
- Do not push to upstream (earendil-works) [machine: bash-deny (?:^|[\n;&|])\s*git(?:\s+-[Cc]\s+\S+|\s+--\S+)*\s+push\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*\supstream\b]
- Do not push to main or release [machine: bash-deny (?:^|[\n;&|])\s*git(?:\s+-[Cc]\s+\S+|\s+--\S+)*\s+push\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*\s(?:HEAD:)?(?:refs/heads/)?(?:main|release)(?=\s|$)]
- Do not open issues or PRs on earendil-works/pi [self-report]
- Do not change dependencies or lockfiles [self-report]
- Do not force-push [machine: bash-deny (?:^|[\n;&|])\s*git(?:\s+-[Cc]\s+\S+|\s+--\S+)*\s+push\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*(?:--force\b|--force-with-lease\b|-f\b|--mirror\b|--delete\b|\s\+[a-zA-Z0-9_/-])]
- Do not rewrite history or hard-reset [machine: bash-deny (?:^|[\n;&|])\s*git(?:\s+-[Cc]\s+\S+|\s+--\S+)*\s+(?:commit\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*--amend\b|rebase\b|filter-branch\b|filter-repo\b|reset\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*--hard\b)]
- Specify files explicitly when staging or committing [machine: bash-deny (?:^|[\n;&|])\s*git(?:\s+-[Cc]\s+\S+|\s+--\S+)*\s+(?:commit|add)\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*\s(?:-[aA]\b|-am\b|--all\b|\.(?=\s|$)|:/(?=\s|$))]

## Budget
One working session. Fullscreen copy: at most 3 revise-and-test rounds after the first
passing test set. On reaching it: INCOMPLETE - RESUME REQUIRED (resume: open
`docs/2026-10-21-soft-wrap-output-v2-plan.md`, continue from the first unchecked unit on
branch personal/soft-wrap-output in /home/remote3/dev/pi).

## Settled decisions
- Widen scope to fullscreen copy; keep the regular-mode change (minsubb13 2026-10-22, "1번으로 진행")
- Regular mode: keep word-wrapped rows and accept extra spaces at joins (minsubb13 2026-10-21)
- Regular mode: tall paragraphs redraw from the top visible row instead of a full redraw (minsubb13 2026-10-21)
- Ghostty is the regular-mode pass bar; herdr may keep today's behavior there; any wrong join stops the run (minsubb13 2026-10-21)
- Always on; `PI_TUI_SOFT_WRAP=0` disables (minsubb13 2026-10-21)
- Do not change the operator's `tuiMode` setting (fullscreen stays the default) (minsubb13 2026-10-22, by choosing option 1 over switching modes)
- Execution by gpt-6.1-sol, design and supervision by Claude Opus; independent review by Claude Opus in a fresh context before integration (minsubb13 2026-10-21)
- Branch `personal/soft-wrap-output`, push to fork `origin`; reflect in the `1.3.0-personal` install (minsubb13 2026-10-21)

## Discretion
- How the fullscreen renderer learns which rows continue: reuse `SOFT_WRAP_MARKER` (enabled while the fullscreen renderer renders its components) and read it from the raw rows the selection is copied from, or keep a per-row flag next to them.
- How the wrap helper records whether a break consumed whitespace (for example a second marker variant or a flag array).
- Test helpers; exact code layout inside the write scope.

## Standing rules

- End the run with the completion report (`references/reports.md`) once after the completion signal: show the deliverable, state what changed where and what verified it, and explain it for a reader with no context. The signal never replaces the report [self-report]
- Before the signal, semantically re-check the request, every required condition, current artifacts, and validation evidence. Missing, failed, unsuitable, or stale evidence means not complete; after any edit during re-check, re-validate and re-check [self-report]
- Incomplete, blocked, waiting, and status-only turns run no completion signal; the signal declares the contracted work itself complete, never an assessment, report, or attempt [self-report]
- Pass the re-check to `record.cjs done --review "<evidence summary>" --goal "<goal-test result>" --summary "<summary>"` (last tool call; no marker line in the message). On pass, S2 removes the pointer and `progress.json` [hook: S2]
- Numbers and claims carry provenance (verified / quoted / unverified)
- Independent review: the reviewer reads the pinned commit, contract, artifacts, and evidence read-only (author summary is not authority). Findings cite the violated condition and evidence; a disputed MUST-FIX on a required condition means not complete [self-report]
- Plan units transition only via `record.cjs unit` (`.amber/progress.json`); announce any stop with open units via `amber:mark hold`. Units run serially in the main session [hook: E1, S2]
- Follow the repository's AGENTS.md (no inline imports, erasable TS only, `npm run check` after code changes, tui tests via `node --test`) [self-report]

## Question handling
Default: on a discovery outside the contract, full stop plus a stop report (`references/reports.md`).
Waiting for the operator's smoke test is a legitimate hold (`hold - U2 - external: operator smoke test`).

## Carry-over (filled at completion)
- Left behind:
- Waiting (what waits on whose judgment):
- Next action:
