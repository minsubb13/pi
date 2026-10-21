import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import xterm from "@xterm/headless";
import { createProbe } from "./soft-wrap-probe.mjs";

test("probe output autowraps without explicit newlines inside the sample", async () => {
	for (const columns of [40, 80, 120]) {
		const probe = createProbe(columns);
		assert.ok(probe.sample.startsWith("SOFT_WRAP_BEGIN "));
		assert.ok(probe.sample.endsWith(" SOFT_WRAP_END"));
		assert.equal(/[\r\n\x1b]/.test(probe.sample), false);
		assert.ok(probe.sample.length > columns * 2 && probe.sample.length < columns * 3);
		const terminal = new xterm.Terminal({ cols: columns, rows: 12, allowProposedApi: true });
		const write = (text) => new Promise((resolve) => terminal.write(text, resolve));
		try {
			await write(probe.initial);
			const buffer = terminal.buffer.active;
			assert.equal(buffer.getLine(2).isWrapped, true);
			assert.equal(buffer.getLine(3).isWrapped, true);
			const rows = [1, 2, 3].map((row) => buffer.getLine(row).translateToString(true));
			await write(probe.redraw);
			assert.deepEqual(
				[1, 2, 3].map((row) => buffer.getLine(row).translateToString(true)),
				rows,
			);
		} finally {
			terminal.dispose();
		}
	}
});

test("probe rejects undersized terminal dimensions", () => {
	for (const columns of [0, 39, undefined, Number.NaN]) assert.throws(() => createProbe(columns));
});

test("help works without a TTY and normal execution refuses a piped session", () => {
	const script = new URL("./soft-wrap-probe.mjs", import.meta.url);
	const help = spawnSync(process.execPath, [script.pathname, "--help"], { encoding: "utf8" });
	assert.equal(help.status, 0);
	assert.match(help.stdout, /Do not paste into pi/);
	const piped = spawnSync(process.execPath, [script.pathname], { encoding: "utf8" });
	assert.equal(piped.status, 1);
	assert.match(piped.stderr, /Run interactively in Ghostty/);
});
