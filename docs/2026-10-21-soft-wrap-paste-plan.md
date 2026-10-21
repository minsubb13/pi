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

## Probe verdicts

- Ghostty:
- herdr in Ghostty:

## Progress log
