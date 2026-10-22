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

Operator results pending. Script self-checks are not Ghostty/herdr copy evidence.

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

Full run reference (not required by the decision above), Ghostty alone, then herdr inside Ghostty (80+ columns, 16+ rows):

```sh
node /home/remote3/dev/pi/scripts/personal/soft-wrap-probe-v2.mjs
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
