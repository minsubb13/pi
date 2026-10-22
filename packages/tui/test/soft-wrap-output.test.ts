import assert from "node:assert/strict";
import { test } from "node:test";
import type { Terminal as XtermTerminalType } from "@xterm/headless";
import { Markdown } from "../src/components/markdown.ts";
import {
	areSoftWrapMarkersEnabled,
	extractSoftWrapRows,
	SOFT_WRAP_MARKER,
	setSoftWrapMarkersEnabled,
} from "../src/soft-wrap-output.ts";
import { encodeKitty } from "../src/terminal-image.ts";
import { type Component, CURSOR_MARKER, TuiBase } from "../src/tui.ts";
import { TuiMainScreen } from "../src/tui-main-screen.ts";
import { stripTerminalSequences, visibleWidth, wrapTextWithAnsi } from "../src/utils.ts";
import { defaultMarkdownTheme } from "./test-themes.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

const PARAGRAPH = "A paragraph copied from pi should stay a logical line even when its words fill several visual rows.";
const RESET = "\x1b[0m\x1b]8;;\x07";

class RecordingTerminal extends VirtualTerminal {
	writes: string[] = [];

	override write(data: string): void {
		this.writes.push(data);
		super.write(data);
	}

	get output(): string {
		return this.writes.join("");
	}

	get buffer(): XtermTerminalType["buffer"]["active"] {
		return (this as unknown as { xterm: XtermTerminalType }).xterm.buffer.active;
	}
}

class Rows implements Component {
	lines: string[] = [];

	render(): string[] {
		return this.lines;
	}

	invalidate(): void {}
}

function marked(text: string, width: number): string {
	return text.padEnd(width) + SOFT_WRAP_MARKER;
}

function flags(terminal: RecordingTerminal, count: number): boolean[] {
	return Array.from({ length: count }, (_, index) => terminal.buffer.getLine(index)?.isWrapped ?? false);
}

function logicalText(terminal: RecordingTerminal, count: number): string {
	let text = "";
	for (let index = 0; index < count; index++) {
		const row = terminal.buffer.getLine(index);
		assert.ok(row);
		if (index > 0 && !row.isWrapped) text += "\n";
		text += row.translateToString(true);
	}
	return text;
}

function restoreEnv(name: string, previous: string | undefined): void {
	if (previous === undefined) delete process.env[name];
	else process.env[name] = previous;
}

test("ANSI wrapping distinguishes display wraps from literal newlines without changing rows", () => {
	const text = `\x1b[3m${PARAGRAPH}\nA real break\r\n${PARAGRAPH}\x1b[23m`;
	const continued: boolean[] = [];
	const rows = wrapTextWithAnsi(text, 32, continued);
	assert.deepEqual(rows, wrapTextWithAnsi(text, 32));
	assert.deepEqual(continued, [true, true, true, false, false, true, true, true, false]);
	const emptyFlags: boolean[] = [];
	assert.deepEqual(wrapTextWithAnsi("", 32, emptyFlags), [""]);
	assert.deepEqual(emptyFlags, [false]);
});

test("only full-width marked rows with a non-image successor can continue", () => {
	const image = encodeKitty("AAAA", { columns: 2, rows: 1, imageId: 42, moveCursor: false });
	const input = [
		marked("prose", 20),
		`short${SOFT_WRAP_MARKER}`,
		marked("before image", 20),
		image + SOFT_WRAP_MARKER,
		marked("last", 20),
	];
	const { lines, continued } = extractSoftWrapRows(input, 20, true);
	assert.deepEqual(continued, [true, false, false, false, false]);
	assert.ok(lines.every((line) => !line.includes(SOFT_WRAP_MARKER)));
	assert.deepEqual(extractSoftWrapRows(input, 20, false).continued, [false, false, false, false, false]);
	assert.ok(input[0].includes(SOFT_WRAP_MARKER), "extraction must not mutate cached component output");
	assert.deepEqual(
		extractSoftWrapRows([`${marked("boxed", 18)} |`, "next"], 20, true).continued,
		[false, false],
		"a wrapper that adds a border must not join its rows",
	);
	assert.deepEqual(
		extractSoftWrapRows([marked("first", 20), ""], 20, true).continued,
		[false, false],
		"an empty successor cannot trigger terminal autowrap",
	);
});

test("standalone Markdown stays unmarked, including after a regular render and after render errors", () => {
	const md = new Markdown(PARAGRAPH, 1, 0, defaultMarkdownTheme);
	const original = md.render(32);
	const terminal = new RecordingTerminal(32, 12);
	const tui = new TuiMainScreen(terminal);
	tui.addChild(md);
	try {
		tui.renderNow();
		assert.ok(tui.captureRenderState().previousContinued.some(Boolean));
		assert.equal(areSoftWrapMarkersEnabled(), false);
		assert.deepEqual(md.render(32), original, "cache key must include marker context");
		tui.addChild({
			render: () => {
				throw new Error("render failed");
			},
			invalidate: () => {},
		});
		assert.throws(() => tui.renderNow(), /render failed/);
		assert.equal(areSoftWrapMarkersEnabled(), false, "a failed render must not leak the context");
	} finally {
		tui.stop();
	}
});

test("Markdown keeps literal breaks, code, quotes, lists, and tables as hard rows", () => {
	setSoftWrapMarkersEnabled(true);
	try {
		const md = new Markdown(`${PARAGRAPH}\nShort line\n\n${PARAGRAPH}`, 1, 0, defaultMarkdownTheme);
		const rows = md.render(32);
		const extracted = extractSoftWrapRows(rows, 32, true);
		const shortIndex = rows.findIndex((line) => stripTerminalSequences(line).includes("Short line"));
		assert.ok(shortIndex > 0);
		assert.equal(extracted.continued[shortIndex - 1], false);
		assert.equal(extracted.continued[shortIndex], false);
		for (const text of [
			`\`\`\`\n${PARAGRAPH}\n\`\`\``,
			`> ${PARAGRAPH}`,
			`- ${PARAGRAPH}`,
			`| A | B |\n|---|---|\n| ${PARAGRAPH} | value |`,
		]) {
			assert.ok(
				new Markdown(text, 1, 0, defaultMarkdownTheme).render(32).every((line) => !line.includes(SOFT_WRAP_MARKER)),
				text,
			);
		}
	} finally {
		setSoftWrapMarkersEnabled(false);
	}
});

for (const bg of [false, true]) {
	test(`a Markdown paragraph copies as one logical line (background=${bg})`, async () => {
		const terminal = new RecordingTerminal(32, 12);
		const tui = new TuiMainScreen(terminal);
		const md = new Markdown(
			PARAGRAPH,
			1,
			0,
			defaultMarkdownTheme,
			bg ? { bgColor: (text) => `\x1b[44m${text}\x1b[49m` } : undefined,
		);
		tui.addChild(md);
		try {
			tui.renderNow();
			await terminal.flush();
			const { previousLines, previousContinued } = tui.captureRenderState();
			assert.ok(previousLines.length > 2);
			assert.deepEqual(
				previousContinued,
				previousLines.map((_, index) => index < previousLines.length - 1),
			);
			assert.deepEqual(
				flags(terminal, previousLines.length),
				previousLines.map((_, index) => index > 0),
			);
			assert.equal(logicalText(terminal, previousLines.length).trim().replace(/ +/g, " "), PARAGRAPH);
			assert.ok(!terminal.output.includes(SOFT_WRAP_MARKER));
			assert.ok(!terminal.output.includes("\r\n"));
			assert.ok(previousLines.every((line) => visibleWidth(line) === 32));
		} finally {
			tui.stop();
		}
	});
}

test("short text and distinct paragraphs stay separate", async () => {
	const terminal = new RecordingTerminal(32, 12);
	const tui = new TuiMainScreen(terminal);
	tui.addChild(new Markdown("Short first\nSecond line\n\nThird paragraph", 1, 0, defaultMarkdownTheme));
	try {
		tui.renderNow();
		await terminal.flush();
		assert.deepEqual(flags(terminal, 4), [false, false, false, false]);
		assert.equal(
			logicalText(terminal, 4).replace(/ +\n/g, "\n").trim(),
			"Short first\n Second line\n\n Third paragraph",
		);
	} finally {
		tui.stop();
	}
});

test("a changed continuation row redraws the entire logical line contiguously", async () => {
	const terminal = new RecordingTerminal(20, 8);
	const tui = new TuiMainScreen(terminal);
	const rows = new Rows();
	rows.lines = [marked("first", 20), marked("middle", 20), "last".padEnd(20), "separate"];
	tui.addChild(rows);
	try {
		tui.renderNow();
		await terminal.flush();
		terminal.writes = [];
		rows.lines[1] = marked("changed", 20);
		tui.renderNow();
		await terminal.flush();
		assert.deepEqual(flags(terminal, 4), [false, true, true, false]);
		assert.equal(tui.fullRedraws, 1);
		assert.ok(
			terminal.output.includes(
				`\x1b[2K${"first".padEnd(20)}${RESET}${"changed".padEnd(20)}${RESET}${"last".padEnd(20)}${RESET}`,
			),
		);
		assert.ok(!terminal.output.includes("\r\n"), "no hard break or erase/cursor motion inside the logical line");
		assert.ok(!terminal.output.includes("separate"));
	} finally {
		tui.stop();
	}
});

test("a short final continuation erases old content without breaking the incoming join", async () => {
	const terminal = new RecordingTerminal(20, 8);
	const tui = new TuiMainScreen(terminal);
	const rows = new Rows();
	rows.lines = [marked("first", 20), "long final text", "neighbor"];
	tui.addChild(rows);
	try {
		tui.renderNow();
		await terminal.flush();
		rows.lines[1] = "short";
		tui.renderNow();
		await terminal.flush();
		assert.equal(terminal.buffer.getLine(1)?.translateToString(true).trimEnd(), "short");
		assert.deepEqual(flags(terminal, 3), [false, true, false]);
	} finally {
		tui.stop();
	}
});

test("wide and combining characters wrap at display-column boundaries", async () => {
	const terminal = new RecordingTerminal(24, 16);
	const tui = new TuiMainScreen(terminal);
	const text = "한국어 문장이 화면 너비를 넘어가도 복사한 문단은 이어집니다. Cafe\u0301 and emoji 🎯 remain intact.";
	tui.addChild(new Markdown(text, 1, 0, defaultMarkdownTheme));
	try {
		tui.renderNow();
		await terminal.flush();
		const state = tui.captureRenderState();
		assert.ok(state.previousContinued.some(Boolean));
		assert.deepEqual(
			flags(terminal, state.previousLines.length),
			state.previousLines.map((_, index) => index > 0),
		);
		assert.ok(!logicalText(terminal, state.previousLines.length).includes("\n"));
		assert.ok(terminal.getViewport().join("").includes("Cafe\u0301"));
	} finally {
		tui.stop();
	}
});

test("streaming a paragraph through several wrapped lengths preserves every join", async () => {
	const terminal = new RecordingTerminal(32, 12);
	const tui = new TuiMainScreen(terminal);
	const md = new Markdown("", 1, 0, defaultMarkdownTheme);
	tui.addChild(md);
	try {
		for (const end of [20, 40, 70, PARAGRAPH.length]) {
			md.setText(PARAGRAPH.slice(0, end));
			tui.renderNow();
			await terminal.flush();
			const state = tui.captureRenderState();
			assert.deepEqual(
				flags(terminal, state.previousLines.length),
				state.previousLines.map((_, index) => index > 0),
			);
			assert.equal(
				logicalText(terminal, state.previousLines.length).trim().replace(/ +/g, " "),
				PARAGRAPH.slice(0, end).trim(),
			);
		}
	} finally {
		tui.stop();
	}
});

test("shrinking a wrapped paragraph resets Ghostty joins and preserves the screen's bottom row", async () => {
	const terminal = new RecordingTerminal(20, 5);
	const tui = new TuiMainScreen(terminal);
	const rows = new Rows();
	rows.lines = [
		marked("first", 20),
		marked("middle", 20),
		"last".padEnd(20),
		"neighbor".padEnd(20),
		"BOTTOM".padEnd(20),
	];
	tui.addChild(rows);
	try {
		tui.renderNow();
		await terminal.flush();
		terminal.writes = [];
		rows.lines = [
			"short".padEnd(20),
			"next".padEnd(20),
			"third".padEnd(20),
			"neighbor".padEnd(20),
			"BOTTOM".padEnd(20),
		];
		tui.renderNow();
		await terminal.flush();
		assert.deepEqual(flags(terminal, 5), [false, false, false, false, false]);
		assert.deepEqual(
			terminal.getViewport().map((line) => line.trimEnd()),
			["short", "next", "third", "neighbor", "BOTTOM"],
		);
		// xterm clears flags on ordinary erase too; this byte assertion is required by
		// the actual Ghostty probe: D1/D2 fail and only delete+insert (D3) succeeds.
		assert.ok(terminal.output.includes("\x1b[M\x1b[L"), "Ghostty needs row replacement, not just erase");
		assert.equal(tui.fullRedraws, 1);
	} finally {
		tui.stop();
	}
});

test("a changed join with identical row text resets only hard boundaries and rebuilds remaining wraps", async () => {
	const terminal = new RecordingTerminal(20, 8);
	const tui = new TuiMainScreen(terminal);
	const rows = new Rows();
	rows.lines = [marked("first", 20), marked("second", 20), "third".padEnd(20), "fourth"];
	tui.addChild(rows);
	try {
		tui.renderNow();
		await terminal.flush();
		rows.lines[1] = "second".padEnd(20);
		tui.renderNow();
		await terminal.flush();
		assert.deepEqual(flags(terminal, 4), [false, true, false, false]);
		assert.ok(logicalText(terminal, 4).includes("\nthird"));
	} finally {
		tui.stop();
	}
});

test("deleting a wrapped tail, clearing to empty, and rendering again leaves no join", async () => {
	const terminal = new RecordingTerminal(20, 8);
	const tui = new TuiMainScreen(terminal);
	const rows = new Rows();
	tui.addChild(rows);
	try {
		for (const lines of [
			[marked("first", 20), marked("second", 20), "third".padEnd(20)],
			["short".padEnd(20)],
			[],
			["new first".padEnd(20), "new second".padEnd(20)],
		]) {
			rows.lines = lines;
			tui.renderNow();
			await terminal.flush();
			assert.equal(terminal.getViewport()[0].trimEnd(), stripTerminalSequences(lines[0] ?? "").trimEnd());
		}
		assert.deepEqual(flags(terminal, 2), [false, false]);
	} finally {
		tui.stop();
	}
});

test("overlays disable continuation and hiding one restores it", async () => {
	const terminal = new RecordingTerminal(32, 12);
	const tui = new TuiMainScreen(terminal);
	tui.addChild(new Markdown(PARAGRAPH, 1, 0, defaultMarkdownTheme));
	const overlay = new Rows();
	overlay.lines = ["modal"];
	try {
		tui.renderNow();
		await terminal.flush();
		const handle = tui.showOverlay(overlay, { row: 0, col: 0, width: 5 });
		tui.renderNow();
		await terminal.flush();
		assert.ok(tui.captureRenderState().previousContinued.every((value) => !value));
		assert.ok(flags(terminal, 4).every((value) => !value));
		handle.hide();
		tui.renderNow();
		await terminal.flush();
		assert.ok(tui.captureRenderState().previousContinued.some(Boolean));
		assert.equal(terminal.buffer.getLine(1)?.isWrapped, true);
	} finally {
		tui.stop();
	}
});

test("a paragraph beginning above the viewport falls back to a full render", async () => {
	const terminal = new RecordingTerminal(20, 3);
	const tui = new TuiMainScreen(terminal);
	const rows = new Rows();
	rows.lines = [marked("first", 20), marked("second", 20), marked("third", 20), "fourth".padEnd(20), "tail"];
	tui.addChild(rows);
	try {
		tui.renderNow();
		await terminal.flush();
		rows.lines[3] = "changed fourth".padEnd(20);
		tui.renderNow();
		await terminal.flush();
		assert.equal(tui.fullRedraws, 2);
		assert.deepEqual(flags(terminal, 5), [false, true, true, true, false]);
		assert.ok(terminal.getViewport()[1].includes("changed fourth"));
	} finally {
		tui.stop();
	}
});

test("forced redraw replaces previously wrapped screen rows and keeps separate lines separate", async () => {
	const terminal = new RecordingTerminal(20, 5);
	const tui = new TuiMainScreen(terminal);
	const rows = new Rows();
	rows.lines = [marked("first", 20), "second".padEnd(20)];
	tui.addChild(rows);
	try {
		tui.renderNow();
		await terminal.flush();
		terminal.writes = [];
		rows.lines = ["short".padEnd(20), "next".padEnd(20)];
		tui.renderNow(true);
		await terminal.flush();
		assert.ok(terminal.output.includes("\x1b[5M\x1b[5L"), "full erase must not retain Ghostty's wrap metadata");
		assert.deepEqual(flags(terminal, 2), [false, false]);
	} finally {
		tui.stop();
	}
});

test("capture and restore retain continuation metadata", async () => {
	const terminal = new RecordingTerminal(20, 8);
	const first = new TuiMainScreen(terminal);
	const rows = new Rows();
	rows.lines = [marked("first", 20), "second".padEnd(20)];
	first.addChild(rows);
	first.renderNow();
	await terminal.flush();
	const state = first.captureRenderState();
	first.stop({ preserveScreen: true });
	const second = new TuiMainScreen(terminal);
	second.addChild(rows);
	second.restoreRenderState(state);
	try {
		assert.deepEqual(second.captureRenderState(), state);
		rows.lines = ["short".padEnd(20), "other".padEnd(20)];
		second.renderNow();
		await terminal.flush();
		assert.deepEqual(flags(terminal, 2), [false, false]);
		assert.ok(terminal.output.includes("\x1b[M\x1b[L"));
	} finally {
		second.stop();
	}
});

test("PI_TUI_SOFT_WRAP=0 preserves the old full, differential, and shrink byte protocol", async () => {
	const previous = process.env.PI_TUI_SOFT_WRAP;
	process.env.PI_TUI_SOFT_WRAP = "0";
	const terminal = new RecordingTerminal(32, 12);
	const tui = new TuiMainScreen(terminal);
	const md = new Markdown(PARAGRAPH, 1, 0, defaultMarkdownTheme);
	const rows = new Rows();
	tui.addChild(rows);
	try {
		const plain = md.render(32);
		rows.lines = plain;
		tui.renderNow();
		assert.equal(terminal.output, `\x1b[?2026h${plain.map((line) => line + RESET).join("\r\n")}\x1b[?2026l`);
		assert.ok(tui.render(32).every((line) => !line.includes(SOFT_WRAP_MARKER)));
		const mdTui = new TuiMainScreen(new RecordingTerminal(32, 12));
		mdTui.addChild(md);
		assert.deepEqual(mdTui.render(32), plain, "opt-out applies to actual Markdown rendering too");
		assert.equal(areSoftWrapMarkersEnabled(), false);
		terminal.writes = [];
		const changed = "changed".padEnd(32);
		rows.lines = [plain[0], changed, ...plain.slice(2)];
		tui.renderNow();
		assert.equal(terminal.output, `\x1b[?2026h\x1b[${plain.length - 2}A\r\x1b[2K${changed}${RESET}\x1b[?2026l`);
		terminal.writes = [];
		rows.lines = [plain[0]];
		tui.renderNow();
		assert.equal(
			terminal.output,
			`\x1b[?2026h\x1b[1A\r\x1b[1B${Array.from({ length: plain.length - 1 }, (_, index) => `\r\x1b[2K${index < plain.length - 2 ? "\x1b[1B" : ""}`).join("")}\x1b[${plain.length - 1}A\x1b[?2026l`,
		);
		await terminal.flush();
		assert.ok(!terminal.output.includes("\x1b[M\x1b[L"));
	} finally {
		tui.stop();
		restoreEnv("PI_TUI_SOFT_WRAP", previous);
	}
});

test("the base renderer strips markers as a safety net for fullscreen and overlay output", () => {
	class ResetOnlyTui extends TuiBase {
		readonly mode = "fullscreen" as const;
		protected doRender(): void {}
		resetLines(lines: string[]): string[] {
			return this.applyLineResets(lines);
		}
	}
	const tui = new ResetOnlyTui(new RecordingTerminal());
	assert.deepEqual(tui.resetLines([`text${SOFT_WRAP_MARKER}${CURSOR_MARKER}`]), [`text${CURSOR_MARKER}${RESET}`]);
});
