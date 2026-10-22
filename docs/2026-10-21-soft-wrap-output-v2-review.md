# Review - soft-wrap-output v2: fullscreen copy and regular-mode renderer (2026-10-22)

Reviewer: Claude Opus 5.5 (claude-opus-5-5) through the Claude Agent SDK on remote3 (Linux). Read-only, fresh context. Started 2026-10-22; no clock was available in the read-only session, so the start time is unrecorded. The review started after the reviewed commit's timestamp of 13:04 +0900.

Reviewed commit: dd5297089831410802d3c98539646037aa954a89 (zone /home/remote3/dev/pi, branch personal/soft-wrap-output; HEAD read from `.git/refs/heads/personal/soft-wrap-output`). Code commits from the branch reflog: 77392e425, b4955a1ae, 9e2d45a14, 991aafb23.

Contract: docs/2026-10-21-soft-wrap-output-v2-contract.md. The superseded docs/2026-10-21-soft-wrap-output-contract.md supplies the regular-mode terms that condition 2 carries over. Plan: docs/2026-10-21-soft-wrap-output-v2-plan.md, plus docs/2026-10-21-soft-wrap-output-plan.md.

Scope:
- Read in full: both contracts and both plans.
- Read in full in `packages/tui`: `src/soft-wrap-output.ts`, `src/tui-main-screen.ts`, `src/tui-alt-screen.ts`, `src/layout.ts`, `test/soft-wrap-copy.test.ts`, `test/soft-wrap-output.test.ts`.
- Read in full in `packages/coding-agent`: `chat-viewport.ts`, `components/assistant-message.ts`, `user-message.ts`, `custom-message.ts`, `compaction-summary-message.ts`, `visual-truncate.ts`.
- Read in part:
  - `utils.ts` (`visibleWidth`, `stripTerminalSequences`, `ansiCodeLength`, `wrapTextWithAnsi`, `wrapSingleLine`, `breakLongWord`, `sliceWithWidth`)
  - `markdown.ts` (lines 1-480 and the `renderToken` paragraph, text, html and space cases)
  - `tui.ts` (`Container.render`, `compositeTuiLine`, `applyLineResets`)
  - `box.ts` render, `v-stack.ts` render, `stack.ts` allocation, `scroll-view.ts` scrollbar and content width, `mouse-region.ts` render
  - `interactive-mode.ts` (dock mount, `showExtensionCustom`, `/debug`) and `examples/extensions/summarize.ts`
  - `.git` HEAD, refs and the branch reflog
- Tools: Read, Grep and Glob only. No command, test, build or git diff was run.

Verdict: FAIL

FAIL = at least one MUST-FIX. PASS WITH FIXES = no MUST-FIX, at least one SHOULD-FIX. PASS = nothing above NOTE. The verdict is the reviewer's; the author never edits it. A re-review appends a new verdict line with its date.

## Findings

Only findings tied to a contract condition, each with the evidence that shows the problem (file:line, command output). A finding without evidence is a NOTE. Style, naming, and improvements outside the contract are not findings; the reviewer may list them under NOTE and they never block.

- [MUST-FIX] F1 The fullscreen screen-selection copy can join a Markdown row to an unrelated row below it. This happens when the layout cuts a Markdown box short at a row that continues.
  - Problem: the copy assumes that the screen row after a marked row is that row's continuation. Layout clipping breaks this assumption.
  - Evidence (verified by reading):
    - A plain component keeps all of its rendered `lines` but receives `allocatedHeight` from the stack (`packages/tui/src/layout.ts:117-131`).
    - A numeric basis or shrinking makes that allocation smaller than the rendered row count (`components/stack.ts:141-153`).
    - `paintBox` paints only the allocated rows. Its full-width fast path places the raw source row on the screen, including the trailing `SOFT_WRAP_MARKER` (`layout.ts:335-351`).
    - `screenWrapMarkers` keeps a marker when the visible text of the row and of the next screen row matches the layout (`tui-alt-screen.ts:1731-1739`). This also holds when the next row belongs to another component.
    - The copy then joins whenever the previous row ends with the marker and the current row is not blank (`tui-alt-screen.ts:1468-1476`).
  - Static trace (not run):
    - Setup: a 24x40 `TuiAltScreen` with `setLayoutRoot(new VStack([{ component: new Markdown(PARAGRAPH, 1, 0, theme), basis: 2 }, new Text("dock", 0, 0)]))`, and a drag from row 0, col 1 to row 2, col 3.
    - Screen rows 0-1 are the first two paragraph rows, and both carry a marker. Row 2 is `dock`.
    - The copy gives `<row0> <row1> dock` instead of `<row0> <row1>\ndock`.
  - Reachable in pi:
    - Every dock entry can shrink (`coding-agent/src/modes/interactive/chat-viewport.ts:31-38`).
    - A non-overlay `ctx.ui.custom` component is placed in the editor slot (`interactive-mode.ts:2966-2983`).
    - The shipped `examples/extensions/summarize.ts:122-131` puts a Markdown there. With a summary taller than the terminal, a drag from the summary into the footer joins the footer text into the paragraph.
  - The tests miss this case: `soft-wrap-copy.test.ts:181-187` uses an unclipped Markdown root, and `:218-228` clips only inside a ScrollView, which uses the raw-row path.
  - Violates condition 1 ("Selections outside Markdown paragraphs copy exactly as today") and the settled decision that any wrong join stops the run.
  - Possible fixes, both inside the write scope:
    - Recover a marker only when row+1 is painted by the same layout box from source line index+1. `nextLayout.root` boxes carry `lines`, `rect`, `clip` and `lineOffset`.
    - Or pair the markers: put an end marker on row i and a start marker on row i+1, and join only when both are present. This also fixes F2.
- [SHOULD-FIX] F2 When `VStack.render` truncates rows, the last kept Markdown row keeps its continuation marker.
  - Effect: the next entry's first row joins that row in regular mode (by terminal autowrap) and in the fullscreen ScrollView copy.
  - Evidence (verified by reading):
    - `components/v-stack.ts:25` keeps only `rendered[index]!.slice(0, sizes[index])` rows.
    - `extractSoftWrapRows` accepts the truncated row because it is full width and the next row is not empty (`soft-wrap-output.ts:31-39`).
    - The renderer then omits `\r\n` after it (`tui-main-screen.ts:318`, `:562-563`).
    - The copy joins it in `tui-alt-screen.ts:1468-1476`.
  - Reach: pi's built-in components do not reach this. pi uses VStack only as a layout node (`chat-viewport.ts:31,41`). TUI consumers and extensions that render a VStack with a numeric basis or `maxSize` around Markdown do reach it.
  - Violates condition 2 (v1 condition 2: only rows that continue onto the next visual row are joined) and condition 1.
  - Fixing it in `v-stack.ts` falls outside the write scope; the paired-marker fix from F1 avoids that.
- [SHOULD-FIX] F3 Markdown wrapped in a `Box` never joins in either mode. This covers the compaction summary, branch summary, skill invocation and default custom messages.
  - Cause: `Box` appends right padding, and with a background also the background reset, after the marker (`components/box.ts:150`, `:165-170`). Both the regular-mode and the copy paths require `endsWith(SOFT_WRAP_MARKER)` (`soft-wrap-output.ts:34`, `tui-alt-screen.ts:1470`).
  - Affected components:
    - `compaction-summary-message.ts:10,16,48`
    - `branch-summary-message.ts:10,47`
    - `skill-invocation-message.ts:11,47`
    - `custom-message.ts:36,108-112`
  - The test at `soft-wrap-output.test.ts:97-101` asserts that a bordered wrapper must not join, so this is a deliberate conservative choice. The plans, however, record no operator decision that narrows condition 1, and condition 1 names "other Markdown-based messages".
  - The result is today's behavior, not a wrong join. Condition 1 is partly met.
  - Options:
    - Treat a marker followed only by spaces and SGR or OSC 8 reset sequences as "at end". Border characters would still block the join.
    - Or ask the operator to accept the residual.
- [NOTE] F4 In regular mode, `/debug` writes wrap markers into its debug log.
  - `interactive-mode.ts:6962` calls `this.ui.render(width)`, and `TuiMainScreen.render` enables markers (`tui-main-screen.ts:179-187`).
  - The markers are JSON-escaped in a file and never reach the terminal. Any other external caller of `TuiMainScreen.render` also receives marked rows.
- [NOTE] F5 The copy drops non-ASCII whitespace at the start of a continuation row.
  - Only `" "` counts as a space token (`utils.ts:835`). A break before a token that starts with U+00A0, for example in `foo \u00a0bar`, leaves the NBSP at the row start.
  - `selected.trimStart()` then removes it (`tui-alt-screen.ts:1475`).
  - A run of several spaces consumed at a break copies as one space (`utils.ts:981-995`; the matrix test normalizes spaces at `soft-wrap-copy.test.ts:326`). This matches the wording of condition 1.
- [NOTE] F6 With an active SGR style, a specific wrap sequence produces a visually empty row.
  - Example: thinking text, which is italic and colored (`assistant-message.ts:151-154`).
  - Trigger: a wrap caused by a whitespace token, followed by a token wider than the content width.
  - Cause: `currentLine` becomes the active codes (`utils.ts:991-994`), and the long-token branch pushes that non-empty string as a row (`utils.ts:953-962`).
  - The fullscreen copy then inserts `\n` instead of a space, because the join requires a non-blank successor (`tui-alt-screen.ts:1473`). This loses a join; it does not join wrongly.
  - This is a static trace. I did not check whether the empty row exists at the base commit.
- [NOTE] F7 The opt-out tests do not replay the pinned base 01452e0f8.
  - `soft-wrap-copy.test.ts:164-179` compares new code with markers on against the same code with markers off. `soft-wrap-output.test.ts:502-538` compares against hand-written byte strings.
  - Reading the code, `PI_TUI_SOFT_WRAP=0` gates off every new branch:
    - `markdown.ts:284,349,352,372`
    - `tui-main-screen.ts:181,296-301` (continued is all false), `312`, `318`, `405-410`, `430`, `435` (a no-op, because `visibleChange` implies firstChanged >= prevViewportTop), `440`, `443-456` (empty set, no bytes), `562`, `588`, `618`
    - `tui-alt-screen.ts:1469`, `1709`, `1731-1739` (empty suffix, so `previousSelectionScreen` equals `previousScreen`)
  - I found no byte difference. "Identical to today" is still an inference, because I could not see the base.

## Condition check

| Contract condition | Status | Reason |
| --- | --- | --- |
| 1. Fullscreen copy joins soft-wrapped Markdown paragraph rows; real breaks, block kinds and partial selections are handled; other selections copy as today | partly met | The pi transcript path is correct as far as code reading shows (verified). Markers go only on top-level paragraph and text rows (`markdown.ts:332,352,372`). The space flag is row-aligned in every push path of `wrapSingleLine` (`utils.ts:930-1017`) and is tested (`soft-wrap-copy.test.ts:309-352`). The copy trims padding and margin and adds one space only with the space marker (`tui-alt-screen.ts:1461-1479`). Reversed selections are normalized (`:1409-1424`). Raw ScrollView rows survive the scrollbar and flashes. Overlays force hard rows. Gaps: F1 (wrong join under layout clipping), F3 (Box-wrapped messages), F2. |
| 2. Regular mode keeps the v1 behavior | partly met | For pi's own compositions, verified by reading: the autowrap separators (`tui-main-screen.ts:318,562-563,588,618`); the logical-line expansion (`:429-441`); the stale-join DL/IL prepass and repaint (`:399-410,436-456`); the forced-redraw DL/IL (`:312-315`); and the operator-approved viewport-top clamp (`:429-435`). v2 adds only the space marker, which is stripped (`soft-wrap-output.ts:21-23`) and does not break `endsWith` (`:34`). The marker context is restored in a `finally` block (`:179-187`) and tested (`soft-wrap-output.test.ts:109-131`). Gap: F2 for VStack.render consumers. |
| 3. `PI_TUI_SOFT_WRAP=0` turns the fullscreen join off | met | No markers are rendered (`tui-alt-screen.ts:1709`), the recovered suffix is empty (`:1731-1739`), and the join is gated (`:1469`). Tested at `soft-wrap-copy.test.ts:164-179`. The oracle-strength caveat is F7. |
| 4. Tests cover the listed cases and the existing suites pass | met (coverage); pass count quoted | Wrapped paragraph as one line (`soft-wrap-copy.test.ts:70-90`). CJK and long token (`:92-104`). Two paragraphs, literal break and hard break (`:115-130`). List, code, quote, heading and table (`:132-144`). Partial selection across a join (`:146-162`). Opt-out (`:164-179`). The v1 tests are in `soft-wrap-output.test.ts`. I counted 30 tests in `soft-wrap-copy.test.ts`, which matches the plan (verified). 349 pass / 0 fail is quoted, not run. No test covers a clipped layout box (F1). |
| 5. Personal install runs the new build; `releases/1.3.0` is unchanged; operator smoke test passes in Ghostty and herdr | met (quoted) | v2 plan, progress log lines 75-78: build, symlink, sha256 check, installed-binary tmux OSC 52 check, and the operator's quote. The reviewer could not access `~/.pi` (permission denied) or `/tmp`. |
| 6. Independent review: no MUST-FIX open, every finding disposed | not met | This document. F1 is an open MUST-FIX, and no finding is disposed yet. |
| 7. `npm run check` clean; committed on the branch and pushed to `origin` | not met (pending U4) | The code commits are on the branch (reflog lines 8, 10, 16, 18) and HEAD is dd52970 (verified). The `npm run check` result is quoted, not run. `.git/refs/remotes/origin/personal/` holds only `soft-wrap-paste`, and `packed-refs` has no entry for this branch, so there is no evidence of a push yet. |

## Dispositions

Filled by the author after the review, one row per finding. A MUST-FIX is disposed only by a fix the reviewer re-checked, or by the operator's explicit acceptance of the residual; a disputed MUST-FIX on a required condition means the run is not complete.

to be filled by author

## What this review did not check

- Nothing was run: no `node --test`, no `npm run check`, no build, and no terminal (xterm, tmux, Ghostty or herdr). F1, F2 and F6 are static traces and were not executed.
- No git diff was viewed. The base 01452e0f8 could not be read, so "identical to today" claims are inferred from the gating in the current code (F7).
- `git status` was not run. The working tree is assumed to equal dd52970.
- The existing suites in the oracle list were not read: `tui-alt-screen.test.ts`, `mouse-components.test.ts`, `layout.test.ts`, the overlay tests, `markdown.test.ts` and `wrap-ansi.test.ts`.
- Not checked: the probe scripts under `scripts/personal/`; the installed bundle, `current-version` and the sha256 baseline; the origin remote.
- Extension reachability of F1 and F2 was traced through the shipped `summarize` example only. No wider survey was done.
- Performance was not measured. This includes Markdown cache churn when a component is rendered both inside and outside the marker context, and the cost of whole-logical-line redraws while streaming.
