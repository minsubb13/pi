import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import xterm from "@xterm/headless";
import { createProbe } from "./soft-wrap-probe-v2.mjs";

for (const columns of [80, 181, 204]) {
	test(`v2 probe preserves intended rows and wrap flags at ${columns} columns`, async () => {
		const probe = createProbe(columns);
		const terminal = new xterm.Terminal({ cols: columns, rows: 16, allowProposedApi: true });
		const write = (text) => new Promise((resolve) => terminal.write(text, resolve));
		const line = (row) => terminal.buffer.active.getLine(row + 4);
		try {
			assert.equal(probe.rows.length, 3);
			assert.ok(probe.rows.slice(0, -1).some((row) => columns - row.length - 1 > 1));
			for (const stage of probe.stages) {
				await write(stage.output);
				const afterShrink = /^d\d-after$/.test(stage.id);
				if (afterShrink) {
					assert.equal(line(0).translateToString(true).trimEnd(), ` ${probe.short}`, stage.id);
					assert.equal(line(1).translateToString(true).trimEnd(), ` ${probe.hard}`, stage.id);
					assert.equal(line(1).isWrapped, false, `${stage.id}: P and Q must not join in xterm`);
					for (let row = 2; row <= probe.rows.length; row++) assert.equal(line(row).translateToString(true).trimEnd(), "", stage.id);
				} else {
					for (let row = 0; row < probe.rows.length; row++) {
						assert.equal(line(row).translateToString(true).trimEnd(), ` ${probe.rows[row]}`, stage.id);
						assert.equal(line(row).isWrapped, row > 0, stage.id);
					}
					assert.equal(line(probe.rows.length).translateToString(true), ` ${probe.hard}`, stage.id);
					assert.equal(line(probe.rows.length).isWrapped, false, stage.id);
					if (stage.id === "a" || stage.id === "b") {
						for (let row = 0; row < probe.rows.length - 1; row++) {
							for (let col = probe.rows[row].length + 1; col < columns - 1; col++) {
								assert.equal(line(row).getCell(col).getCode(), stage.id === "a" ? 32 : 0, `${stage.id}: written vs erased padding`);
							}
						}
					}
				}
			}
		} finally {
			terminal.dispose();
		}
	});
}

for (const columns of [80, 181, 204]) {
	test(`v2 quick probe runs A, contiguous redraw, then pi-like shrink at ${columns} columns`, async () => {
		const probe = createProbe(columns);
		assert.deepEqual(probe.quickStages.map(({ id }) => id), ["a", "c-after", "d2-after"]);
		const terminal = new xterm.Terminal({ cols: columns, rows: 16, allowProposedApi: true });
		const write = (text) => new Promise((resolve) => terminal.write(text, resolve));
		const line = (row) => terminal.buffer.active.getLine(row + 4);
		try {
			for (const stage of probe.quickStages.slice(0, 2)) {
				await write(stage.output);
				for (let row = 0; row < probe.rows.length; row++) {
					assert.equal(line(row).translateToString(true).trimEnd(), ` ${probe.rows[row]}`, stage.id);
					assert.equal(line(row).isWrapped, row > 0, stage.id);
				}
				assert.equal(line(probe.rows.length).translateToString(true).trimEnd(), ` ${probe.hard}`, stage.id);
			}
			await write(probe.quickStages[2].output);
			assert.equal(line(0).translateToString(true).trimEnd(), ` ${probe.short}`);
			assert.equal(line(1).translateToString(true).trimEnd(), ` ${probe.hard}`);
			assert.equal(line(1).isWrapped, false);
			assert.match(terminal.buffer.active.getLine(0).translateToString(true), /^3\/3: paragraph shortened/);
		} finally {
			terminal.dispose();
		}
	});
}

for (const columns of [80, 181, 204]) {
	test(`v2 follow-up probe: erased padding, then two shrink candidates at ${columns} columns`, async () => {
		const probe = createProbe(columns);
		assert.deepEqual(probe.followupStages.map(({ id }) => id), ["b", "d1-after", "d3-after"]);
		const terminal = new xterm.Terminal({ cols: columns, rows: 16, allowProposedApi: true });
		const write = (text) => new Promise((resolve) => terminal.write(text, resolve));
		const line = (row) => terminal.buffer.active.getLine(row + 4);
		try {
			await write(probe.followupStages[0].output);
			for (let row = 0; row < probe.rows.length; row++) {
				assert.equal(line(row).translateToString(true).trimEnd(), ` ${probe.rows[row]}`);
				assert.equal(line(row).isWrapped, row > 0);
			}
			for (const stage of probe.followupStages.slice(1)) {
				await write(stage.output);
				assert.equal(line(0).translateToString(true).trimEnd(), ` ${probe.short}`, stage.id);
				assert.equal(line(1).translateToString(true).trimEnd(), ` ${probe.hard}`, stage.id);
				assert.equal(line(1).isWrapped, false, stage.id);
			}
		} finally {
			terminal.dispose();
		}
	});
}

test("v2 probe exposes deterministic stages and refuses undersized widths", () => {
	assert.deepEqual(createProbe(80).stages.map(({ id }) => id), ["a", "b", "c-before", "c-after", "d1-before", "d1-after", "d2-before", "d2-after", "d3-before", "d3-after"]);
	for (const columns of [0, 79, undefined, Number.NaN]) assert.throws(() => createProbe(columns));
});

test("v2 help works without a TTY and normal execution refuses a piped session", () => {
	const script = new URL("./soft-wrap-probe-v2.mjs", import.meta.url);
	const help = spawnSync(process.execPath, [script.pathname, "--help"], { encoding: "utf8" });
	assert.equal(help.status, 0);
	assert.match(help.stdout, /Do not paste into pi/);
	const piped = spawnSync(process.execPath, [script.pathname], { encoding: "utf8" });
	assert.equal(piped.status, 1);
	assert.match(piped.stderr, /Run interactively in Ghostty/);
});
