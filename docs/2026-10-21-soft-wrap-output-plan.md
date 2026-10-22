# Plan - soft-wrap output (2026-10-21)

Contract: docs/2026-10-21-soft-wrap-output-contract.md (authority). This plan is revisable.

## Work units

- [ ] U1 Probe v2 for pi-shaped rows, contiguous redraw, and stale joins in Ghostty and herdr-in-Ghostty [unit: U1 scope=scripts/personal/**,docs/2026-10-21-soft-wrap-output-plan.md oracle=node --test scripts/personal/*.test.mjs && operator copy results recorded under Probe v2 verdicts with the criteria-v1 gate decision]
- [ ] U2 Renderer soft-wrap output for Markdown rows with xterm tests [unit: U2 scope=packages/tui/src/tui-main-screen.ts,packages/tui/src/tui.ts,packages/tui/src/utils.ts,packages/tui/src/components/markdown.ts,packages/tui/src/soft-wrap-output.ts,packages/tui/src/index.ts,packages/tui/test/** after=U1 oracle=cd packages/tui && node --test test/soft-wrap-output.test.ts test/tui-render.test.ts test/tui-shrink.test.ts test/overlay-non-capturing.test.ts test/overlay-options.test.ts test/overlay-short-content.test.ts test/tui-overlay-style-leak.test.ts test/markdown.test.ts test/wrap-ansi.test.ts]
- [ ] U3 Build, personal install, operator smoke test [unit: U3 scope=docs/2026-10-21-soft-wrap-output-plan.md after=U2 oracle=cat ~/.pi/agent/install/current-version; readlink -f ~/.pi/agent/install/releases/1.3.0-personal/node_modules/.bin/pi; pi --version; (cd ~/.pi/agent/install/releases/1.3.0 && sha256sum -c --quiet /tmp/pi-1.3.0-before.sha256); operator copy smoke test in Ghostty and herdr]
- [ ] U4 Independent review by Claude Opus (fresh context) [unit: U4 scope=docs/2026-10-21-soft-wrap-output-review.md after=U2,U3 oracle=grep -q '^Verdict:' docs/2026-10-21-soft-wrap-output-review.md and every F<n> disposed, no open MUST-FIX]
- [ ] U5 Integration check, commit, push [unit: U5 scope=docs/2026-10-21-soft-wrap-output-plan.md after=U1,U2,U3,U4 oracle=npm run check (clean) && U2 oracle tests && git log -1 origin/personal/soft-wrap-output]

## Notes

### U1 probe v2 (`scripts/personal/soft-wrap-probe-v2.mjs`, design by Opus)
ASCII text, interactive, Enter advances stages, refuses to run on resize or non-TTY.
Each case prints `CASE_x_BEGIN ... CASE_x_END` paragraphs; the operator copies each into a
plain text editor (not pi) and reports: one line or not, and visible extra spaces.
- (a) pi shape: each row = 1 space + word-wrapped content + space padding to full width;
  continued rows are not followed by `\r\n` (autowrap does the row change).
- (b) alternative shape: continued row = 1 space + content, then `\x1b[K` (erase to end),
  then move to the last column (`\x1b[<cols>G`) and write one space, so autowrap still
  triggers while the gap cells are never written. Report whether the gap copies as spaces.
  (A second alternative may be added: no left margin on continuation rows, so the
  break space is carried by the padding.)
- (c) contiguous redraw: rewrite the whole (a)-paragraph from its first row
  (`\r\x1b[2K` on the first row, then autowrap through all rows, `\r\n` only after its
  last row).
- (d) stale join: draw paragraph P (3 rows, autowrapped) followed by line Q. Redraw so P
  becomes 1 short row ending with `\x1b[2K` + text + `\r\n`, and the old rows below it
  are rewritten with Q and blanks the way pi does (`\r\x1b[2K` + text, `\r\n`). Copy P+Q:
  wrong join = P and Q on one line. Variants: d1 plain (pi today); d2 rewrite each
  formerly-wrapped row with `\x1b[2K` then write to the last column and `\r\n`;
  d3 `\x1b[M\x1b[L` (delete+insert line) before rewriting. Report per variant.
Gate per contract condition 1.

Executor brief for U1 (gpt-6.1-sol; Opus supervises):
- Model the new script on `scripts/personal/soft-wrap-probe.mjs` (pure `createProbe(columns)`
  returning byte strings per stage, thin interactive `main()`); keep v1 untouched.
- Self-test `scripts/personal/soft-wrap-probe-v2.test.mjs` with `@xterm/headless` (already a
  tui dependency; import it the way `packages/tui/test/virtual-terminal.ts` does): feed each
  stage, assert row wrap flags (`isWrapped`) and joined text match the intended design
  (e.g. (a) continuation rows wrapped; (d) after redraw, the row after P is not wrapped in
  xterm for d2/d3). xterm is only a script check, not the Ghostty/herdr verdict.
- Number every case on screen and print a one-line instruction per stage; keep total
  screen height <= 30 rows at 80+ cols so the operator can copy without scrolling.
- Hand the operator exact steps and a fill-in report template (case -> one line? extra
  spaces? wrong join?) for Ghostty and herdr; then `amber-mark hold - U1 - external:
  operator probe copy results` and stop.

### U2 renderer (design by Opus; executor fills details)
- Markdown wrap loop marks each wrapped row that is followed by another row of the same
  source line with a zero-width marker at its end (after padding/background).
- TUI strips the marker before overlay compositing into a per-row `continued` flag;
  overlay-covered rows lose the flag; `PI_TUI_SOFT_WRAP=0` strips without flags.
- Main-screen renderer: between row i and i+1, write nothing if row i is continued and
  its visible width equals the terminal width (otherwise `\r\n`). Differential render
  expands `firstChanged` back to the first row of its logical line and `lastChanged`
  forward to its last row; also expands for rows whose `continued` flag changed. If the
  expanded first row is above the viewport, use the existing full redraw.
- Rows written as hard ends use the probe-(d) clearing method.
- Track continued flags alongside `previousLines` (render state capture/restore too).

Operator decision 2026-10-21 ("1번으로할까" to the row-shape question): keep today's
word-wrapped rows with padding; accept extra spaces at joins when copying. No char wrap.

Executor brief for U2 (gpt-6.1-sol; Opus design, supersedes the sketch above where it differs):
- `packages/tui/src/soft-wrap-output.ts` (new):
  - `SOFT_WRAP_MARKER = "\x1b_pi:w\x07"` (zero-width APC; `visibleWidth` already skips APC).
  - Module flag + `setSoftWrapMarkersEnabled(enabled)` / `areSoftWrapMarkersEnabled()`.
    Markdown emits markers only when the flag is on. `TuiMainScreen` turns it on (when
    `process.env.PI_TUI_SOFT_WRAP !== "0"`) as part of its start/first render, and off in stop.
    Reason: non-TUI consumers print Markdown output raw (for example
    `packages/coding-agent/src/package-manager-cli.ts:666` self-update note via console.log),
    and fullscreen mode is out of scope. With the flag off, Markdown output is byte-identical
    to today.
  - `extractSoftWrapRows(lines, width, allow)` -> `{ lines, continued }`: strips every marker
    from every row; `continued[i]` is true only when `allow`, the row carried a marker,
    `visibleWidth(stripped) === width`, `i < lines.length - 1`, and neither row i nor i+1 is an
    image line.
- `markdown.ts` render loop (`for (const line of renderedLines)` + `wrapTextWithAnsi`, ~331):
  when markers are enabled, record which wrapped rows are followed by another row of the same
  source line, and append the marker after margins/background/padding. Do not mark quote rows
  (their `│` prefix would be copied), list-item wrapping inside `renderToken`, or image lines.
  Include the flag in the render cache key.
- `tui.ts` `applyLineResets`: strip markers from every row (safety net for alt-screen and
  overlays). Do not change anything else in the base class.
- `tui-main-screen.ts` `doRender`, after overlay compositing and cursor extraction, before
  `applyLineResets`: `extractSoftWrapRows(newLines, width, !this.hasOverlayEntries)`.
  Keep `previousContinued` next to `previousLines` (include in capture/restore/reset state).
  - Row separator in full render and differential loops: write nothing between row i and i+1
    when `continued[i]`; otherwise `\r\n` as today. Do not write `\x1b[2K` before a row that
    continues the previous row (it is full width; avoid touching the pending-wrap state).
  - Differential range: treat a change of `continued[i]` as a change of row i. Expand
    `firstChanged` back while the row above is joined to it in the previous or new frame;
    expand `lastChanged` forward to the last row of its logical line in the new frame.
    If the expanded first row is above the previous viewport, use the existing full redraw.
  - Stale join: before rewriting row i in the differential loop, if row i or row i-1 was
    joined in the previous frame and that join is gone in the new frame, write
    `\x1b[M\x1b[L` (delete+insert line) instead of `\x1b[2K`. Because this pushes out the
    screen's bottom row, whenever it is used set the render end to `newLines.length - 1`
    so every remaining content row on screen is rewritten.
  - With markers disabled (env `PI_TUI_SOFT_WRAP=0`), nothing is continued and every write
    must be byte-identical to today's algorithm.
- Tests `packages/tui/test/soft-wrap-output.test.ts` (node:test + `test/virtual-terminal.ts`
  xterm; extend the helper only if needed to read `isWrapped`): the contract condition 3
  list, plus: overlay present -> no joins; image lines never joined; shrink case with content
  reaching the bottom screen row keeps the bottom row content intact after delete+insert;
  `PI_TUI_SOFT_WRAP=0` byte output equals a run with markers disabled; Markdown with flag off
  emits no marker. Use a negative control: show at least the shrink/stale-join test fails
  without the delete+insert step.
- Keep the diff small and readable; no `any`; top-level imports only; erasable TS.
- Then run the U2 oracle and `npm run check`; record pass counts and elapsed time.

### U2 implementation and evidence (GPT-6.1-sol, 2026-10-21)

- `soft-wrap-output.ts`: zero-width marker, scoped marker context, and extraction of safe
  full-width paragraph joins. The marker must still be at the end of a row; a container
  that adds a border or padding after it does not accidentally make a bordered row join.
  Images and empty successor rows cannot continue a logical line.
- `Markdown`: only top-level prose paragraph/text tokens get continuation markers; actual
  source line breaks, headings, code, tables, lists, and quote borders remain hard rows.
  `wrapTextWithAnsi` accepts an optional continuation-flags collector, populated by the
  same existing wrapping loop so ANSI state across literal newlines is unchanged.
- Refinement of the design's module flag: it is on only for the synchronous duration of
  `TuiMainScreen.render()`, restored in `finally`, not for the whole start/stop lifetime.
  This avoids leaking markers to standalone Markdown consumers and fullscreen rendering,
  even when they share the process or a render throws. The Markdown cache includes it.
- Main renderer tracks flags in capture/restore state and expands differential updates to
  entire logical lines. Old joins that have disappeared are cleared by D3 in a **prepass**,
  before writing the contiguous new paragraph (inserting resets during pending autowrap
  would break the new join). Remaining content is repainted after the resets. Short final
  continuation rows erase stale trailing cells after printing, not before autowrap.
- A forced full redraw must also clear Ghostty's retained row metadata; after the existing
  screen+scrollback clear it deletes and inserts the cleared screen rows if soft wraps
  were previously rendered. This history bit survives `resetRenderState()`.
- Correction to the earlier bottom-row warning: delete then insert returns the shifted
  rows, pushing out the blank row introduced by delete, not the original bottom content.
  The bottom-row preservation test verifies the resulting screen; repainting the suffix
  is retained to restore any neighboring wrap metadata affected by row movement.
- Tests: first passing set 18 new tests; refinement round 1 of 3 added short-final-row,
  CJK/combining-character, border/empty-successor guards, and stronger opt-out checks.
  Final U2 oracle: 226 tests pass / 0 fail, 1867.02591ms (verified). `npm run check` clean,
  no fixes, errors, warnings, or infos (verified).
- Negative control: replacing the D3 prepass with ordinary `2K` makes the shrink regression
  fail (`Ghostty needs row replacement, not just erase`, 0 pass / 1 fail). Restoring D3
  passes. xterm itself clears wraps on erase, unlike Ghostty, so the regression also asserts
  the probe-established byte protocol; it does not claim xterm alone models Ghostty.
- Not yet built or installed; operator smoke evidence and fresh independent review pending.

### U3
`npm run build:offline` (never `npm run build`); the personal symlink picks up the bundle.
Operator: start a NEW pi, ask for a long multi-paragraph answer, copy a paragraph and a
paragraph pair into TextEdit in Ghostty and in herdr; report one line or not, extra
spaces, and any wrong join.

### U4
`claude -p "<request>" --permission-mode dontAsk --tools "Read,Grep,Glob"` with the
contract path, plan path, verdict template
(`~/.pi/agent/git/github.com/minsubb13/amber/plugin/skills/set/templates/review-verdict.md`),
and the commit SHA. Save output to `docs/2026-10-21-soft-wrap-output-review.md`.

## Probe v2 verdicts

Ghostty results are recorded below. herdr was deferred to the installation smoke test by
operator decision. Script self-checks are not Ghostty/herdr copy evidence.

Operator decision 2026-10-21 (answer "1번" to the reduction question): run only the
3-screen quick probe, in Ghostty alone. herdr is not probed; it is observed once in the U3
smoke test. This narrows contract condition 1 (both environments, cases a-d) to Ghostty
cases (a), (c), and (d, pi-like D2 variant); B, D1, and D3 run (`--full`) only if screen 1
shows extra spaces or screen 3 shows a wrong join.

Quick run (default):

```sh
node /home/remote3/dev/pi/scripts/personal/soft-wrap-probe-v2.mjs
```

Report: `1: one line/multiple lines, spaces normal/extra; 2: one line/multiple lines;
3: two lines/joined`.

Data point (tmux 100x20, `capture-pane -J`, verified): screen 1 joins P into one line but
keeps the padding spaces at each join (`spaces.   Terminal`); screen 3 keeps P and Q apart.
tmux is not a target terminal; this only predicts that extra spaces are likely.

### Ghostty quick run result (operator, 2026-10-21)

Operator pasted the three copies into pi's message box (not a plain editor), so pi's paste
unwrap could hide hard breaks. Reading each result with that in mind:
- Screen 1 (A): P is one line with extra spaces at each join (`or       padding`,
  `or    padding`). pi's unwrap cannot create runs of spaces (it trims and joins with one
  space), so the joins and spaces came from Ghostty. The single space in
  `CASE_P_END CASE_Q_BEGIN` is explained by pi's unwrap: replaying `P + "\n" + Q` through
  `unwrapSoftWrappedPaste` joins it the same way (verified). Not evidence of a P/Q join.
- Screen 2 (C after): same as screen 1. One line, extra spaces.
- Screen 3 (D2 after): WRONG JOIN. P and Q came out on one line with a run of 129 spaces
  between them. 45 (short row) + 129 - 1 (Q's margin space) = 173, which matches a padded
  full-width row in a 173-column Ghostty (inferred). Replaying a hard break through
  pi's unwrap keeps the two lines apart (verified), so this join came from Ghostty: a row that
  was autowrapped keeps its join after `\x1b[2K` + full-width rewrite + CR/LF.

Gate status: Ghostty passes (a) one line and (c) redraw. (d) fails for D2. Per the decision,
the follow-up runs B (erased padding) plus D1 and D3 (`--followup`, 3 screens; script
revision 1 of 2).

Follow-up run, Ghostty, copy into TextEdit (not pi):

```sh
node /home/remote3/dev/pi/scripts/personal/soft-wrap-probe-v2.mjs --followup
```

Report: `1: one line/multiple lines, spaces normal/extra; 2: two lines/joined; 3: two lines/joined`.

### Ghostty follow-up result (operator, 2026-10-21)

- Screen 1 (B, erased padding): P one line, still extra spaces at each join (same runs
  as A). Erased cells are copied as spaces, so B gives no gain over A.
- Screen 2 (D1, `\x1b[2K` + short text + CR/LF): WRONG JOIN, 129-space gap (same as D2).
- Screen 3 (D3, `\x1b[M\x1b[L` delete+insert line before rewriting): P and Q on separate
  lines. Q kept its leading margin space (` CASE_Q_BEGIN`), which shows pi's paste unwrap
  did not touch it either.

Gate decision (criteria v1): PROCEED. Ghostty: (a) one line, (c) one line after a
contiguous redraw, (d) a stale join is prevented by delete+insert line (D3). Extra spaces at
joins are unavoidable for word-wrapped rows (A and B both show them); row shape needs an
operator choice before U2 (accept extra spaces vs char wrap).

Supervision note for U2 (Opus): `\x1b[M\x1b[L` deletes the current row (rows below
move up, a blank row enters at the bottom of the scroll region), then inserts a blank row
(rows below move back, the bottom row of the screen is pushed out). Net effect: the
current row becomes a fresh row with no join, and the content of the screen's bottom row
is lost. The renderer may only use it when it then rewrites through the last visible row,
or must limit it to one row (for example a one-row scroll region). Use it only on rows
whose previous state was joined and whose new state is not; prove both effects with xterm
tests.

Full run reference (not required by the decision above), Ghostty alone, then herdr inside Ghostty (80+ columns, 16+ rows):

```sh
node /home/remote3/dev/pi/scripts/personal/soft-wrap-probe-v2.mjs --full
```

Ten screens, Enter advances; Ctrl+C cancels. Do not resize. Copy to TextEdit or another
plain editor, never into pi (paste normalization hides the breaks). Select from
`CASE_P_BEGIN` through `CASE_P_END` for A/B/C. For each D screen, select from
`CASE_P_BEGIN` through `CASE_Q_END`; P should be one logical line and Q a separate line.
Ignore visual wrapping in the receiving editor; check actual line breaks.

Report per environment:

```text
Ghostty / herdr (choose):
A: P=one line/multiple lines; join spaces=normal/extra
B: P=one line/multiple lines; join spaces=normal/extra
C before: P=one line/multiple lines
C after:  P=one line/multiple lines; join spaces=normal/extra
D1 before: P joined internally=yes/no; Q separate=yes/no
D1 after: shortened P and Q separate=yes/no
D2 before: P joined internally=yes/no; Q separate=yes/no
D2 after: shortened P and Q separate=yes/no
D3 before: P joined internally=yes/no; Q separate=yes/no
D3 after: shortened P and Q separate=yes/no
```

D1 uses ordinary erase/rewrite; D2 writes the full width before CR/LF; D3 deletes and
inserts a row before rewriting. These are candidates; no claim is made about their
actual Ghostty/herdr behavior until operator copy results arrive.

Supervision note (Opus): Markdown pads every row to full width today, so D2 is closest to
how pi itself would rewrite a now-hard row; D1 is the unpadded control, D3 the
heavier reset. Script reviewed: stage bytes match the U1 design (a)-(d).

## Progress log
- 2026-10-21 17:27 approval: operator said "Go ahead" to the scope report.
- U1 implemented by GPT-6.1-sol: new `soft-wrap-probe-v2.mjs` with 10 deterministic stages and TTY/resize guards; v1 unchanged. New xterm self-tests at 80, 181, and 204 columns verify visual row text, wrap flags, real written vs erased gap cells, and hard P/Q separation after all three candidate shrink redraws. New+old probe tests: 8 pass / 0 fail (153.994055ms, verified). `npm run check` passes clean, no formatting fixes (verified). xterm results validate only the script, not terminal clipboard semantics. No renderer change or personal-build replacement yet.
- Probe reduced at operator request: default 3-screen quick mode (A, C after, D2 after) added, `--full` keeps 10 screens. Probe tests 11 pass / 0 fail (177.861121ms, verified). Visual check in tmux 100x20 passed for all 3 screens.
- Ghostty quick result recorded (screen 3 wrong join, extra spaces at joins). Added `--followup` (B, D1, D3) as probe revision 1 of 2. Probe tests 14 pass / 0 fail (196.851527ms, verified); tmux 100x20 visual check of the 3 follow-up screens passed.
- U1 verified: Ghostty quick + follow-up results recorded; gate PROCEED with delete+insert line as the stale-join fix; probe tests 14 pass / 0 fail. Row shape (extra spaces vs char wrap) waits for the operator before U2.
- Row shape decided by operator (keep word wrap, accept extra spaces). U2 design written by Opus; execution handed to gpt-6.1-sol.
- U2 implemented: 20 new tests, full U2 oracle 226 pass / 0 fail (1867.02591ms); `npm run check` clean. Negative control confirms the Ghostty-specific D3 byte assertion detects an ordinary-erase regression. Details and design refinements above; refinement rounds used: 1 of 3.
- Opus supervision check after U2 (verified with a temporary xterm test, removed): streaming 200 tokens into one paragraph that grows taller than a 12-row terminal (60 cols, 3 footer rows) caused 146 full redraws with soft wrap on vs 1 with `PI_TUI_SOFT_WRAP=0`. Cause: the contract's discretion row (first row above viewport -> existing full redraw), which clears scrollback and rewrites the whole history each frame. Operator decision needed before U3 (deviates from contract condition 2 wording).
- Operator decision 2026-10-21 ("1번으로하자"): when a paragraph's first row is above the viewport, redraw from the top visible row instead of a full redraw. Deviation from contract condition 2 wording ("from its first row") and from the discretion row (full-redraw fallback), approved by the operator. Ghostty kept a join across a rewrite boundary left by cursor motion in probe v1; herdr may show one newline at that top-of-screen boundary.
- U2 revision (renderer round 2 of 3): clamp in `doRender` after logical-line expansion. Tests: the above-viewport case now asserts no full redraw and a rewrite starting at the top visible row; new streaming regression (200 tokens, 12-row terminal) asserts 1 full redraw total. Negative control: without the clamp both tests fail (19 pass / 2 fail). U2 oracle 227 pass / 0 fail (1890.416529ms); `npm run check` clean on repeat.
- U3 build: `npm run build:offline` exit 0 (80 files, 8.8 MiB); bundle chunk `chunk-CEJPJTEN.js` contains the soft-wrap code. current-version `1.3.0-personal`, symlink -> checkout bundle, `pi --version` 1.3.0 exit 0, releases/1.3.0 matches the 14919-file baseline. tmux 100x30 startup check: new pi starts and renders. Waiting for operator copy smoke test (Ghostty, herdr).
- U3 smoke test FAILED (operator 2026-10-22): copied paragraph still has a newline per row. Diagnosis (verified): the operator's new pi (pid 1630775, started 11:08:17 after the 11:06:25 bundle build, Ghostty over SSH, 173x43) runs in **fullscreen** mode, the 1.3.0 default (`SETTINGS_DEFAULTS.tuiMode = "fullscreen"`, `packages/coding-agent/src/core/settings-defaults.ts:62`; `~/.pi/agent/settings.json` has no `tuiMode`). A write log of the same build in tmux starts with `\x1b[?1049h\x1b[?7l` (alternate screen, autowrap off). In fullscreen mode pi owns mouse selection and builds the copied text itself: `TuiAltScreen.getActiveSelectionText()` joins rows with `\n` (`packages/tui/src/tui-alt-screen.ts:1459`). This run's renderer change only affects regular mode; fullscreen selection copy is listed as "Not answered" in the contract. Stop: out-of-contract decision needed.

