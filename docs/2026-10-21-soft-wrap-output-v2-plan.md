# Plan v2 - soft-wrap copy (2026-10-22)

Contract: docs/2026-10-21-soft-wrap-output-v2-contract.md (authority). This plan is revisable.
Previous run record: docs/2026-10-21-soft-wrap-output-plan.md (probe verdicts, regular-mode evidence).

## Work units

- [ ] U1 Fullscreen selection copy joins soft-wrapped Markdown rows, with tests [unit: U1 scope=packages/tui/src/tui-alt-screen.ts,packages/tui/src/layout.ts,packages/tui/src/tui.ts,packages/tui/src/utils.ts,packages/tui/src/components/markdown.ts,packages/tui/src/soft-wrap-output.ts,packages/tui/src/index.ts,packages/tui/src/tui-main-screen.ts,packages/tui/test/** oracle=cd packages/tui && node --test test/soft-wrap-copy.test.ts test/soft-wrap-output.test.ts test/tui-alt-screen.test.ts test/mouse-components.test.ts test/tui-render.test.ts test/tui-shrink.test.ts test/overlay-non-capturing.test.ts test/overlay-options.test.ts test/overlay-short-content.test.ts test/tui-overlay-style-leak.test.ts test/markdown.test.ts test/wrap-ansi.test.ts test/layout.test.ts]
- [ ] U2 Build, personal install, operator smoke test in fullscreen mode [unit: U2 scope=docs/2026-10-21-soft-wrap-output-v2-plan.md after=U1 oracle=cat ~/.pi/agent/install/current-version; readlink -f ~/.pi/agent/install/releases/1.3.0-personal/node_modules/.bin/pi; pi --version; (cd ~/.pi/agent/install/releases/1.3.0 && sha256sum -c --quiet /tmp/pi-1.3.0-before.sha256); operator fullscreen drag-copy smoke test in Ghostty and herdr]
- [ ] U3 Independent review by Claude Opus (fresh context) [unit: U3 scope=docs/2026-10-21-soft-wrap-output-v2-review.md after=U1,U2 oracle=grep -q '^Verdict:' docs/2026-10-21-soft-wrap-output-v2-review.md and every F<n> disposed, no open MUST-FIX]
- [ ] U4 Integration check, commit, push [unit: U4 scope=docs/2026-10-21-soft-wrap-output-v2-plan.md after=U1,U2,U3 oracle=npm run check (clean) && U1 oracle tests && git log -1 origin/personal/soft-wrap-output]

## Notes

### U1 design (Opus)
- Fullscreen copy path: `TuiAltScreen.getActiveSelectionText()` (`tui-alt-screen.ts:1439`)
  copies from `box.scrollContentLines` (raw component rows from `layout.ts` `renderCached`)
  for ScrollView selections, otherwise from `previousScreen` (rows after `applyLineResets`,
  which strips markers). The transcript lives in a ScrollView, so raw rows are available.
- Enable `SOFT_WRAP_MARKER` while the fullscreen renderer renders its components (same
  scoped pattern as `TuiMainScreen.render`, restored in `finally`), honoring
  `PI_TUI_SOFT_WRAP=0`. Markers never reach the terminal (`applyLineResets` strips them);
  verify layout slicing does not leak or need them.
- Record at each wrapped row whether the break consumed whitespace: extend the
  continuation flags from `wrapTextWithAnsi` (or a second marker) so a join knows whether
  to insert one space. Long-token breaks and CJK breaks insert none.
- Copy join rule: for selected row r whose raw row carries a continuation marker and r+1
  is also selected, append the next row without `\n`: left part = selected text of r with
  trailing spaces removed; right part = selected text of r+1 with the Markdown left margin
  removed (only the leading spaces of that row); separator = one space when the break
  consumed whitespace, else empty. Everything else unchanged. If the source rows are not
  raw (previousScreen path) and no flags are available, keep today's behavior, unless a
  per-row flag can be kept for previousScreen cheaply (discretion).
- `PI_TUI_SOFT_WRAP=0`: no markers, copy identical to today.
- Tests `packages/tui/test/soft-wrap-copy.test.ts` (node:test, `VirtualTerminal`, a
  `TuiAltScreen` with a ScrollView or the same layout the app uses; reuse helpers from
  `tui-alt-screen.test.ts` for mouse drag + `copySelection` capture): contract condition 4
  list. Negative control: show the main join test fails without the join.

### U2
`npm run build:offline`; operator: new pi (default fullscreen), drag over a multi-row
assistant paragraph and two paragraphs, paste into TextEdit, in Ghostty and herdr.

### U3
`claude -p "<request>" --permission-mode dontAsk --tools "Read,Grep,Glob"` with both
contracts, both plans, the verdict template
(`~/.pi/agent/git/github.com/minsubb13/amber/plugin/skills/set/templates/review-verdict.md`),
and the commit SHAs. Save output to `docs/2026-10-21-soft-wrap-output-v2-review.md`.

## Progress log
- 2026-10-22 11:22 approval: operator said "진행" to the v2 scope report. Pointer moved from the v1 contract to this v2 contract.
