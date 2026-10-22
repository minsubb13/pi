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

---

# Review - soft-wrap-output v2 re-review 2: paired wrap markers (2026-10-22)

Reviewer: Claude Opus 5.5 (claude-opus-5-5) through the Claude Agent SDK on remote3 (Linux), read-only, fresh context, started 2026-10-22. The start time is unrecorded because the read-only session had no clock. The review started after the reviewed commit's timestamp of 13:28 +0900.

Reviewed commit: b9cc05966990e97bbd6fc9fb941f8264161511d6 (zone /home/remote3/dev/pi, branch personal/soft-wrap-output; HEAD read from `.git/refs/heads/personal/soft-wrap-output`); code commits 77392e425, b4955a1ae, 9e2d45a14, 991aafb23, 6f44d6bc7 (from the branch reflog)

Contract: docs/2026-10-21-soft-wrap-output-v2-contract.md (the superseded docs/2026-10-21-soft-wrap-output-contract.md supplies the regular-mode terms in condition 2) - Plan: docs/2026-10-21-soft-wrap-output-v2-plan.md, plus docs/2026-10-21-soft-wrap-output-plan.md

Scope:
- Read in full: both contracts, both plans, and review 1 (`docs/2026-10-21-soft-wrap-output-v2-review.md`).
- Read in full in `packages/tui`: `src/soft-wrap-output.ts`, `src/components/markdown.ts`, `src/tui-main-screen.ts`, `src/layout.ts`, `src/components/box.ts`, `src/components/v-stack.ts`, `test/soft-wrap-copy.test.ts`, `test/soft-wrap-output.test.ts`.
- Read in part in `packages/tui`:
  - `src/tui-alt-screen.ts`: lines 1-650 and 1140-1839. This covers imports, lifecycle, the stop dump, prompt jump, search refresh, selection, copy, highlights, flashes and `doRender`.
  - `src/utils.ts`: `visibleWidth`, `stripTerminalSequences`, `extractAnsiCode`/`ansiCodeLength`, `wrapTextWithAnsi`, `wrapSingleLine`, `breakLongWord`, `applyBackgroundToLine`.
  - `src/tui.ts`: `Container`, `compositeTuiLine`, the tail of overlay compositing, `applyLineResets`, `extractCursorPosition`, `resolveFakeCursors`, and the `TuiBase` declaration.
  - `src/components/scroll-view.ts`: constructor and scrollbar visibility.
  - `src/components/mouse-region.ts`: `render`.
- Read in full in `packages/coding-agent/src/modes/interactive`: `chat-viewport.ts`, `components/assistant-message.ts`, `user-message.ts`, `compaction-summary-message.ts`, `custom-message.ts`.
- Read in part in `packages/coding-agent`:
  - `interactive-mode.ts`: document and chat container setup, the streaming component mount, dock containers.
  - `theme/theme.ts`: `bg`.
  - `test/assistant-message.test.ts`: the OSC 133 tests.
  - `examples/extensions/summarize.ts:117-143`.
  - Checked by Grep only: `branch-summary-message.ts`, `skill-invocation-message.ts`, `examples/**` (Markdown construction), and `]133;` across `packages/**/*.ts`.
- Also read `.git` HEAD, the branch ref, the branch reflog, `refs/remotes/origin/personal/` and `packed-refs`.
- Tools: Read, Grep and Glob only. No command, test, build or git diff was run.

Verdict: FAIL (re-review 2, 2026-10-22)

FAIL = at least one MUST-FIX. PASS WITH FIXES = no MUST-FIX, at least one SHOULD-FIX. PASS = nothing above NOTE. The verdict is the reviewer's; the author never edits it - a re-review appends a new verdict line with its date.

## Findings

Only findings tied to a contract condition, each with the evidence that shows the problem (file:line, command output). A finding without evidence is a NOTE. Style, naming, and improvements outside the contract are not findings; the reviewer may list them under NOTE and they never block.

F1-F7 are from review 1. Their re-check results are under Dispositions. The findings below are new in this review.

- [MUST-FIX] F8 In pi's transcript, the last visual row of an assistant message's final paragraph no longer joins the row above it. This happens in fullscreen copy and in regular mode.
  - Problem: the paired protocol requires a continuation row to begin with `SOFT_WRAP_START_MARKER`. Fullscreen allows only spaces and SGR before it; regular mode requires it at byte 0. `AssistantMessageComponent` puts OSC 133 B and C in front of its last row, before Markdown's start marker.
  - Evidence (verified by reading):
    - Markdown writes the start marker as the first bytes of every continuation row (`packages/tui/src/components/markdown.ts:378,381,386`).
    - A message without tool calls gets `lines[lines.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + lines[lines.length - 1]` (`coding-agent/src/modes/interactive/components/assistant-message.ts:80-88`). `coding-agent/test/assistant-message.test.ts:37-46` asserts this prefix.
    - Assistant text is a Markdown with paddingY 0 (`assistant-message.ts:113-116`). So when the final paragraph wraps, its last visual row is the message's last row, and that row reads `\x1b]133;B\x07\x1b]133;C\x07\x1b_pi:wc\x07 ...`.
    - Fullscreen transcript copy reads the raw `scrollContentLines` (`tui-alt-screen.ts:1452-1458`, `layout.ts:162`). The transcript is a ScrollView over `documentContainer`, and assistant messages are mounted directly in it (`chat-viewport.ts:23-30`, `interactive-mode.ts:636-639,3520`). These raw rows keep the OSC 133 prefix. Only `paintBox` strips it, and only for screen rows (`layout.ts:338`).
    - `getSoftWrapJoin` skips only leading spaces and SGR (`soft-wrap-output.ts:34`). It therefore returns `"none"` (`:35`), and the copy inserts `\n` (`tui-alt-screen.ts:1474-1475`).
    - Regular mode passes raw rows to `extractSoftWrapRows` (`tui-main-screen.ts:286,296-300`). `TuiBase` inherits `Container.render` unchanged (`tui.ts:406-418,507`), so nothing strips OSC 133 first. `extractSoftWrapRows` requires `rows[index + 1].startsWith(SOFT_WRAP_START_MARKER)` (`soft-wrap-output.ts:50`), so the boundary is written as `\r\n` (`tui-main-screen.ts:318,562-563`).
    - Before 6f44d6bc7, regular-mode extraction needed only the end marker, full width and a non-empty successor (review 1 F2 evidence; v2 plan line 82 says the start-marker requirement is new). So this boundary used to autowrap, and this is a regression from v1.
  - Static trace (not run):
    - Setup: a final reply whose only paragraph wraps into three rows.
    - In default fullscreen mode, dragging over the three rows copies `<row0> <row1>\n <row2>`. The last part keeps its margin space because the hard-break path does not trim it. It should be one line.
    - The same happens for every final answer whose last paragraph wraps. This is the main case in condition 1 and in the condition 5 smoke test.
  - Why the evidence missed it:
    - Every copy and output test uses a bare Markdown with no OSC 133 prefix (`soft-wrap-copy.test.ts:43-61`). Grep finds no `]133;` in either soft-wrap test file.
    - The installed-binary check after round 3 used a thinking paragraph followed by a bash tool call (v2 plan line 93). A message with tool calls gets no OSC 133 prefix (`assistant-message.ts:82`).
    - The round-3 supervision note says "Continuation rows never carry an OSC 133 prefix (only a message's first row does)" (v2 plan line 91). `assistant-message.ts:87` contradicts it.
  - Violates condition 1 (assistant-text continuation rows are joined) and condition 2 (autowrapped paragraph rows; regression). It also predicts a condition 5 smoke failure on a final paragraph.
  - Possible fix, inside the write scope:
    - Skip leading OSC 133 zone sequences before the start-marker check in both `getSoftWrapJoin` and `extractSoftWrapRows`. The same pattern already exists as `OSC133_ZONE_PREFIX` (`tui-alt-screen.ts:82`, `layout.ts:14`).
    - Add tui tests in which a wrapper prepends `\x1b]133;B\x07\x1b]133;C\x07` to the last row of a wrapped Markdown. Cover ScrollView copy and regular-mode wrap flags.
    - Caveat: after this fix, regular mode writes the OSC 133 bytes while the terminal is in the pending-wrap state. v1 wrote the same bytes, but no probe measured Ghostty or herdr in that state (unverified).
- [SHOULD-FIX] F9 Screen-selection copy can still join two different Markdown boxes. This happens when one box is clipped at its bottom on a continued row and the box below it is clipped at its top on a continuation row.
  - Problem: the pair proves that row r continues and that row r+1 is a continuation. It does not prove that they are consecutive rows of the same paragraph. The root cause of review 1 F1 (adjacent on screen is not adjacent in the source) still applies when both sides are clipped.
  - Evidence (verified by reading):
    - A ScrollView paints its child starting at `scrollTop` (`layout.ts:139-151,333-337`), so its first painted row can carry a start marker.
    - A plain component taller than its allocation is clipped from the top when its cursor line lies below the allocation (`layout.ts:120-124`).
    - Recovery checks only `getSoftWrapJoin(nextLayout.lines[row], nextLayout.lines[row + 1])` plus visible-text equality (`tui-alt-screen.ts:1731-1745`), and the copy joins on the same test (`:1470-1473`).
    - The default ScrollView scrollbar is `"hidden"` (`scroll-view.ts:52`), so no glyph follows the end marker. pi's transcript uses `"auto"`, which is visible only briefly after activity (`scroll-view.ts:74-79`, `chat-viewport.ts:27`).
  - Static trace (not run):
    - Setup: a 24x40 `TuiAltScreen` with `setLayoutRoot(new VStack([{ component: new ScrollView(mdA), basis: 2 }, { component: b = new ScrollView(mdB), basis: 2 }, new Text("dock", 0, 0)]))`, with `PARAGRAPH` in both Markdown components. Then `b.scrollTo(1)` and a render.
    - Press on row 4 (`dock`, outside every ScrollView, so the screen path is used) and drag to row 0, col 1.
    - Row 1 is A's row 1 (end marker) and row 2 is B's row 1 (start marker). The copy gives `<A0> <A1> <B1> <B2>\ndock` instead of `<A0> <A1>\n<B1> <B2>\ndock`.
  - Reach:
    - Not found in shipped pi code. pi copies the transcript from contiguous raw ScrollView rows, and no shipped dock component is top-clipped Markdown (`summarize.ts:122-141` has no cursor).
    - Reachable by TUI consumers, and by extensions that put a Markdown above a focused input in the editor slot or stack several ScrollViews, when the user drags across the boundary on the screen path. This is the same reach level as review 1 F2.
  - Violates condition 1 ("Selections outside Markdown paragraphs copy exactly as today") and the settled decision that any wrong join stops the run.
  - Possible fix: review 1 F1's first option. Recover a pair only when rows r and r+1 are painted by the same layout box from consecutive source lines (`LayoutBox.lines`, `lineOffset`, `rect`). Add the trace above as a test.
- [NOTE] F10 Regular mode still never joins Markdown wrapped in a Box. This covers compaction and branch summaries, skill invocations and default custom messages.
  - `extractSoftWrapRows` requires the end marker at the very end of the row and the start marker at byte 0 (`soft-wrap-output.ts:48-50`). Box adds left padding before the row, and padding plus a background close after it (`box.ts:150,165-170`).
  - This equals the v1 behavior and the plan's design note (v2 plan line 82), so the behaviors that v2 condition 2 lists are kept.
  - However, v1 condition 2 named "other Markdown-based messages", and the plans record no operator acceptance of this residual. It does not block. Record it in the carry-over or ask the operator.

## Condition check

| Contract condition | Status | Reason |
| --- | --- | --- |
| 1. Fullscreen copy joins soft-wrapped Markdown paragraph rows; real breaks, block kinds and partial selections are handled; other selections copy as today | partly met | **Correct as read (verified):** the paired protocol for bare and Box-wrapped Markdown. Markers are placed at `markdown.ts:377-386`; the join test is `soft-wrap-output.ts:31-37`; the copy is `tui-alt-screen.ts:1460-1479`; screen recovery is `:1728-1746`. The fixes for F1, F2 and F3 hold (see Dispositions). **Gaps:** F8 (transcript copy never joins the last row of a final assistant paragraph) and F9 (a wrong join across two clipped boxes, not in shipped pi). |
| 2. Regular mode keeps the v1 behavior | partly met | **Unchanged by 6f44d6bc7 (verified):** the renderer algorithm. Separators: `tui-main-screen.ts:318,562-563,588,618`. Logical-line expansion: `:429-441`. Stale-join prepass: `:399-410,443-456`. Forced-redraw DL/IL: `:312-315`. Viewport-top clamp: `:435`. Opt-out: `:181,299`. Tests moved to the paired protocol (`soft-wrap-output.test.ts`). **Regression:** F8, where the strict `startsWith` at `soft-wrap-output.ts:50` drops a boundary that v1 joined. F10 is a NOTE. |
| 3. `PI_TUI_SOFT_WRAP=0` turns the fullscreen join off | met | **Gating:** with the flag off, Markdown emits no marker of any kind, because the start marker depends on `continued` (`markdown.ts:289,357,377-378`). The fullscreen render scope and the copy are gated (`tui-alt-screen.ts:1706`, `:1470`). Recovery then finds no pair. **Tests:** `soft-wrap-copy.test.ts:172-187`; regular mode `soft-wrap-output.test.ts:535-571`. **Caveat:** the oracle strength issue from F7 still applies. |
| 4. Tests cover the listed cases and the existing suites pass | met (listed coverage); pass count quoted | **Counted (verified):** 38 tests in `soft-wrap-copy.test.ts` and 22 in `soft-wrap-output.test.ts`, both matching the plan. **New regressions:** F1 and F2 at `soft-wrap-copy.test.ts:197-209`, F2 regular mode at `soft-wrap-output.test.ts:117-134`, F3 and the bordered control at `soft-wrap-copy.test.ts:211-237`. **Quoted, not run:** 358 pass / 0 fail and the 7-of-8 negative control. **Oracle gap:** no test models pi's OSC 133 last-row prefix (F8) or two clipped boxes (F9). |
| 5. Personal install runs the new build; `releases/1.3.0` is unchanged; operator smoke test passes in Ghostty and herdr | not met (pending) | **Quoted:** the post-round-3 rebuild, current-version, symlink, `pi --version`, the sha256 baseline and the tmux OSC 52 check (v2 plan lines 92-93). **Stale:** the operator smoke test predates round 3 (line 94); a fresh one is pending. F8 predicts a failure when the dragged paragraph is the last one of a final answer. A fix for F8 needs another rebuild. |
| 6. Independent review: no MUST-FIX open, every finding disposed | not met | **Open:** F8 (MUST-FIX). **Undisposed:** F9 (SHOULD-FIX) and F10 (NOTE). F1-F7 are re-checked under Dispositions. |
| 7. `npm run check` clean; committed on the branch and pushed to `origin` | not met (pending U4) | **Committed (verified):** 6f44d6bc7 and b9cc059 are on the branch (reflog lines 22-23). **No push evidence (verified):** `.git/refs/remotes/origin/personal/` holds only `soft-wrap-paste`, and `packed-refs` has no entry for this branch. **Quoted, not run:** the clean `npm run check`. |

## Dispositions

Filled by the author after the review, one row per finding. A MUST-FIX is disposed only by a fix the reviewer re-checked, or by the operator's explicit acceptance of the residual; a disputed MUST-FIX on a required condition means the run is not complete.

- F1: applied in 6f44d6bc7 - re-checked PASS by Claude Opus 5.5 on 2026-10-22 for the reported trace.
  - `dock` carries no start marker, so `getSoftWrapJoin` returns `"none"` (`soft-wrap-output.ts:35`) and recovery skips the pair (`tui-alt-screen.ts:1734-1742`).
  - Test: `soft-wrap-copy.test.ts:197-209` with `rawScrollRows=false`, rendering between mouse events.
  - The same root cause remains when both sides are clipped; that is F9.
- F2: applied in 6f44d6bc7 - re-checked PASS by Claude Opus 5.5 on 2026-10-22.
  - Regular mode requires the paired start marker (`soft-wrap-output.ts:50`); test `soft-wrap-output.test.ts:117-134`.
  - Raw ScrollView copy is covered by `soft-wrap-copy.test.ts:197-209` with `rawScrollRows=true`.
- F3: applied in 6f44d6bc7 for fullscreen - re-checked PASS by Claude Opus 5.5 on 2026-10-22.
  - `soft-wrap-output.ts:33-36` tolerates trailing spaces, SGR and OSC 8 close sequences, and leading spaces and SGR. Box rows (`box.ts:150,165-170`) and pi's `theme.bg` (`theme.ts:303-306`, SGR only) fit this shape.
  - Tests: `soft-wrap-copy.test.ts:211-237`, including the bordered control.
  - The regular-mode part is unchanged; that is F10.
- F4: no code change (NOTE) - re-checked PASS (disposition accepted) by Claude Opus 5.5 on 2026-10-22. `TuiMainScreen.render` still enables markers (`tui-main-screen.ts:179-187`). The `/debug` file now also contains start markers. The output is file-only and never reaches the terminal.
- F5: no code change (NOTE) - re-checked PASS (disposition accepted) by Claude Opus 5.5 on 2026-10-22. `selected.trimStart()` is unchanged (`tui-alt-screen.ts:1472`). Only an NBSP at a break is lost.
- F6: no code change (NOTE) - re-checked PASS (disposition accepted) by Claude Opus 5.5 on 2026-10-22.
  - With paired markers the visually empty styled row now carries both markers. The copy writes `\n` before that row (blank successor) and then joins the next row without a space (`tui-alt-screen.ts:1470-1473`).
  - The result is a newline where one space belongs. This loses a join; it is still not a wrong join.
- F7: no code change (NOTE) - re-checked PASS (disposition accepted) by Claude Opus 5.5 on 2026-10-22.
  - Gating was re-read with the start marker included: `markdown.ts:289,354,357,377-378`, `tui-alt-screen.ts:1470,1706`, `tui-main-screen.ts:181,299`.
  - Byte identity with 01452e0f8 is still inferred, not replayed.
- F8: to be filled by author
- F9: to be filled by author
- F10: to be filled by author

## What this review did not check

- Nothing was run: no `node --test`, no `npm run check`, no build, and no terminal (xterm, tmux, Ghostty or herdr). F8, F9 and the F6 update are static traces.
- No git diff was viewed. The content of 6f44d6bc7 was inferred from the current files and the plan's design notes. The pre-fix behavior at dd5297089 comes from review 1 and v2 plan line 82.
- `git status` was not run. The working tree is assumed to equal b9cc059.
- Not read in this review:
  - `tui-alt-screen.ts` lines 650-1140 (input, wheel, scrollbar drag, component mouse dispatch).
  - The rest of `tui.ts` and `utils.ts`.
  - The existing suites in the oracle list (`tui-alt-screen.test.ts`, `mouse-components.test.ts`, `layout.test.ts`, the overlay tests, `markdown.test.ts`, `wrap-ansi.test.ts`).
  - `branch-summary-message.ts` and `skill-invocation-message.ts` (checked by Grep only).
- Not probed by anyone: whether Ghostty or herdr keep an autowrap join when OSC 133 B/C bytes arrive in the pending-wrap state. This matters for the regular-mode half of an F8 fix.
- Regular mode has no operator copy evidence in either run, because the v1 smoke test ran in fullscreen mode. Condition 2 rests on xterm tests.
- Not accessed: the installed bundle, `~/.pi`, `/tmp`, and the `origin` remote.
- F9 reach was surveyed only through `examples/**` files that construct a Markdown, and through pi's dock containers.
- Performance was not measured. This includes the per-frame pair recovery over every screen row.
