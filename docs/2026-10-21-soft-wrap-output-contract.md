# Contract - soft-wrap output: copy pi's rendered paragraphs without newlines (2026-10-21)

No load-bearing decision absent from this contract proceeds: stop and bring the question.

Pin: start commit 01452e0f8 on branch personal/soft-wrap-output (created from personal/soft-wrap-paste)
Approval: minsubb13 2026-10-21 - verification state at approval: branch created, no code changed; renderer read in full (packages/tui/src/tui-main-screen.ts), Markdown wrap/pad path read (packages/tui/src/components/markdown.ts:288-357), previous probe verdicts quoted from docs/2026-10-21-soft-wrap-paste-plan.md

## Background

pi in regular (main-screen) mode lets the terminal own mouse selection. Markdown
paragraphs are word-wrapped by the component (`markdown.ts:331`), each visual row gets a
1-column left margin and is padded with spaces to the full terminal width
(`markdown.ts:338-357`), and the renderer writes `\r\n` between every row
(`tui-main-screen.ts`, full render and differential loops). The terminal therefore
records every row as a hard line end, and copying a paragraph out of pi yields one
newline per visual row.

Previous probe (quoted, `docs/2026-10-21-soft-wrap-paste-plan.md`, Probe verdicts):
Ghostty keeps a row joined after an erase-and-rewrite of that row (promote); herdr inside
Ghostty loses the join at a row boundary left by cursor motion after a rewrite (hold).
That probe used a char-wrapped sample with no margin or padding, so it did not measure
pi's real row shape, nor whether a stale "joined" state can glue two now-separate lines.

## Completion conditions

All conditions must hold. Partial progress is not completion.

1. Probe v2 exists in `scripts/personal/` and its operator results are recorded in the
   plan for Ghostty alone and herdr inside Ghostty, covering: (a) pi-shaped rows (left
   margin + space padding to full width) joined by terminal autowrap - one line or not,
   and whether extra spaces appear at the join; (b) an alternative row shape that avoids
   writing padding spaces on continued rows; (c) a whole-paragraph contiguous redraw
   from the first row; (d) stale join: a row that was autowrapped is redrawn as a hard
   line end - whether the next line wrongly joins, with and without a candidate clearing
   sequence. Gate (criteria v1) before renderer work starts:
   - proceed: in Ghostty (a) or (b) copies as one line, (c) stays one line, and (d) shows
     no wrong join with at least one tested sequence;
   - stop and ask the operator: Ghostty fails any of these, or (d) wrong joins in any
     environment cannot be prevented by a tested sequence.
2. Renderer change: Markdown paragraph rows that continue onto the next visual row are
   emitted so the terminal joins them by autowrap (no `\r\n`, no cursor motion at the
   row boundary), using the row shape chosen from probe results. Any redraw that touches
   a row of such a logical line rewrites the logical line contiguously from its first
   row; rows that are no longer continued are written so the terminal does not keep a
   stale join (method from probe (d)). Applies to every component that renders through
   `Markdown` (assistant text, thinking, user messages, other Markdown-based messages);
   tool output, editor, borders, overlays, and images keep today's behavior. Rows covered
   by an overlay are emitted as hard rows. Always on; `PI_TUI_SOFT_WRAP=0` restores
   today's output exactly.
3. Tests in `packages/tui` using the headless xterm virtual terminal pass and cover at
   least: a wrapped paragraph's continuation rows are marked wrapped and the buffer's
   logical text has no newline at row joins; a short paragraph and separate paragraphs
   stay separate lines; a differential redraw that changes a continued row keeps the
   join; a paragraph that shrinks leaves no stale join with the following line;
   `PI_TUI_SOFT_WRAP=0` produces today's byte output; existing renderer tests
   (`tui-render.test.ts`, `tui-shrink.test.ts`, overlay tests, `markdown.test.ts`,
   `wrap-ansi.test.ts`) pass.
4. The installed personal `pi` (`current-version` = `1.3.0-personal`, symlink to this
   checkout's bundle) runs the new build; `releases/1.3.0/` stays byte-for-byte
   identical to `/tmp/pi-1.3.0-before.sha256`; operator smoke test in a new pi: copying
   a multi-row assistant paragraph into a plain text editor gives one line in Ghostty,
   and herdr is reported as observed (pass or today's behavior); in neither environment
   do two separate lines or paragraphs wrongly join.
5. Independent review: `docs/2026-10-21-soft-wrap-output-review.md` by Claude Opus
   (fresh read-only context via `claude -p`), no MUST-FIX open, every finding disposed -
   applied and re-reviewed, rejected with a reason, or brought to the operator.
6. `npm run check` passes with no errors, warnings, or infos; changes are committed on
   `personal/soft-wrap-output` and pushed to `origin` (the fork).

Verification (oracles): condition 1 - operator copy results per environment (manual,
operator judgment) recorded under Probe v2 verdicts, plus probe script self-tests;
conditions 2-3 - `node --test` on the new and listed existing tests in `packages/tui`;
condition 4 - `cat current-version`, `readlink -f`, `pi --version`, `sha256sum -c` in
`releases/1.3.0`, operator smoke test; condition 5 - the review verdict file;
condition 6 - `npm run check` full output, `git log -1 origin/personal/soft-wrap-output`.
Not answered: fullscreen (alt-screen) mode; tool output and other non-Markdown text;
resizing reflow beyond today's full redraw; upstream contribution; terminals other than
Ghostty and herdr-in-Ghostty; periodic upstream sync.

## Forbidden rows

- Write scope: renderer [machine: write-scope packages/tui/src/tui-main-screen.ts]
- Write scope (cont.): TUI base, marker extraction and overlay handling [machine: write-scope packages/tui/src/tui.ts]
- Write scope (cont.): wrap helper [machine: write-scope packages/tui/src/utils.ts]
- Write scope (cont.): Markdown component [machine: write-scope packages/tui/src/components/markdown.ts]
- Write scope (cont.): new soft-wrap output module [machine: write-scope packages/tui/src/soft-wrap-output.ts]
- Write scope (cont.): package exports if the marker must be public [machine: write-scope packages/tui/src/index.ts]
- Write scope (cont.): tests [machine: write-scope packages/tui/test/**]
- Write scope (cont.): probe scripts [machine: write-scope scripts/personal/**]
- Write scope (cont.): run docs [machine: write-scope docs/2026-10-21-soft-wrap-output-*.md]
- Outside the checkout, write only `~/.pi/agent/install/releases/1.3.0-personal/**` and `~/.pi/agent/install/current-version`; never modify `~/.pi/agent/install/releases/1.3.0/`, `~/.pi/agent/bin/pi`, or `~/.local/bin/pi` [self-report]
- Build with `npm run build:offline`, never `npm run build` or `npm run hydrate:model-data` (they replace the 1.3.0 model catalog snapshot) [machine: bash-deny (?:^|[\n;&|])\s*npm\s+run\s+(?:build|hydrate:model-data)(?=\s|$)]
- Do not run `pi update` (it would replace the personal build) [machine: bash-deny (?:^|[\n;&|])\s*pi\s+update\b]
- Do not push to upstream (earendil-works) [machine: bash-deny (?:^|[\n;&|])\s*git(?:\s+-[Cc]\s+\S+|\s+--\S+)*\s+push\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*\supstream\b]
- Do not push to main or release [machine: bash-deny (?:^|[\n;&|])\s*git(?:\s+-[Cc]\s+\S+|\s+--\S+)*\s+push\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*\s(?:HEAD:)?(?:refs/heads/)?(?:main|release)(?=\s|$)]
- Do not open issues or PRs on earendil-works/pi [self-report]
- Do not change dependencies or lockfiles [self-report]
- Do not force-push [machine: bash-deny (?:^|[\n;&|])\s*git(?:\s+-[Cc]\s+\S+|\s+--\S+)*\s+push\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*(?:--force\b|--force-with-lease\b|-f\b|--mirror\b|--delete\b|\s\+[a-zA-Z0-9_/-])]
- Do not rewrite history or hard-reset [machine: bash-deny (?:^|[\n;&|])\s*git(?:\s+-[Cc]\s+\S+|\s+--\S+)*\s+(?:commit\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*--amend\b|rebase\b|filter-branch\b|filter-repo\b|reset\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*--hard\b)]
- Specify files explicitly when staging or committing [machine: bash-deny (?:^|[\n;&|])\s*git(?:\s+-[Cc]\s+\S+|\s+--\S+)*\s+(?:commit|add)\b(?:[^\n;&|"']|"[^"\n]*"|'[^'\n]*')*\s(?:-[aA]\b|-am\b|--all\b|\.(?=\s|$)|:/(?=\s|$))]

## Budget
One to two working sessions. Probe: at most 2 script revisions after the first operator
run. Renderer: at most 3 revise-and-test rounds after the first passing test set. On
reaching it: INCOMPLETE - RESUME REQUIRED (resume: open
`docs/2026-10-21-soft-wrap-output-plan.md`, continue from the first unchecked unit on
branch personal/soft-wrap-output in /home/remote3/dev/pi).

## Settled decisions
- Probe first, renderer second; the probe gate in condition 1 decides whether renderer work starts (minsubb13 2026-10-21)
- Scope: Markdown-rendered content only (minsubb13 2026-10-21)
- If padding spaces show up at joins, test an alternative row shape in the probe and choose from results (minsubb13 2026-10-21)
- Ghostty is the pass bar; herdr may keep today's behavior, but any wrong join in any environment stops the run (minsubb13 2026-10-21)
- Always on, `PI_TUI_SOFT_WRAP=0` disables (minsubb13 2026-10-21)
- Branch `personal/soft-wrap-output` from `personal/soft-wrap-paste`, push to fork `origin`; reflect in the `1.3.0-personal` install (minsubb13 2026-10-21)
- Execution by gpt-6.1-sol, design and supervision by Claude Opus; independent review of the renderer change by Claude Opus in a fresh context before integration (minsubb13 2026-10-21)

## Discretion
- Continuation marker: a zero-width APC sequence (like `CURSOR_MARKER`, e.g. `\x1b_pi:w\x07`) at the end of a continued row, extracted by the TUI into a per-row flag before output; exact sequence and extraction point are tunable.
- Where the marker is added: in the Markdown component's wrap loop (not in `wrapTextWithAnsi` globally), so other components are unaffected.
- Stale-join clearing method and row shape: chosen from probe (b)/(d) results.
- Probe script language and exact output pattern; xterm-based test helpers.
- When the first row of a logical line to redraw is above the viewport, fall back to the existing full redraw path.

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
Waiting for the operator's probe copy results is a legitimate hold on U1 (`hold - U1 - external: operator probe copy results`); the same applies to the smoke test in U3.

## Carry-over (filled at completion)
- Left behind:
- Waiting (what waits on whose judgment):
- Next action:
