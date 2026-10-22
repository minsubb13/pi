import assert from "node:assert/strict";
import { type TestContext, test } from "node:test";
import { findAltScreenSearchMatches } from "../src/alt-screen-search.ts";
import { Markdown } from "../src/components/markdown.ts";
import { ScrollView } from "../src/components/scroll-view.ts";
import { Text } from "../src/components/text.ts";
import { VStack } from "../src/components/v-stack.ts";
import {
	areSoftWrapMarkersEnabled,
	SOFT_WRAP_MARKER,
	SOFT_WRAP_SPACE_MARKER,
	setSoftWrapMarkersEnabled,
} from "../src/soft-wrap-output.ts";
import { getCapabilities, setCapabilities } from "../src/terminal-image.ts";
import type { Component } from "../src/tui.ts";
import { TuiAltScreen } from "../src/tui-alt-screen.ts";
import { stripTerminalSequences, visibleWidth, wrapTextWithAnsi } from "../src/utils.ts";
import { defaultMarkdownTheme } from "./test-themes.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

const PARAGRAPH = "A copied paragraph should stay one logical line even when the display wraps its words across rows.";

class RecordingTerminal extends VirtualTerminal {
	writes: string[] = [];
	renderBetweenInputs?: () => void;

	override sendInput(data: string): void {
		super.sendInput(data);
		// Real mouse events arrive in separate event-loop turns, with highlighted
		// frames rendered during the drag rather than only after its release.
		this.renderBetweenInputs?.();
	}

	override write(data: string): void {
		this.writes.push(data);
		super.write(data);
	}
}

function fixture(t: TestContext, text: string, width = 24, implicit = false) {
	const terminal = new RecordingTerminal(width, 40);
	const copies: string[] = [];
	const md = new Markdown(text, 1, 0, defaultMarkdownTheme);
	const plain = md.render(width).map(stripTerminalSequences);
	const tui = new TuiAltScreen(terminal, undefined, undefined, {
		copySelection: async (text) => {
			copies.push(text);
			return true;
		},
	});
	if (implicit) tui.addChild(md);
	else tui.setLayoutRoot(new ScrollView(md, { primary: true }));
	tui.start();
	tui.renderNow();
	terminal.renderBetweenInputs = () => tui.renderNow();
	t.after(() => tui.stop());
	return { terminal, tui, md, plain, copies };
}

function drag(terminal: VirtualTerminal, start: { row: number; col: number }, end: { row: number; col: number }) {
	terminal.sendInput(`\x1b[<0;${start.col + 1};${start.row + 1}M`);
	terminal.sendInput(`\x1b[<32;${end.col + 1};${end.row + 1}M`);
	terminal.sendInput(`\x1b[<0;${end.col + 1};${end.row + 1}m`);
}

function selectAll(terminal: VirtualTerminal, rows: string[]) {
	drag(terminal, { row: 0, col: 1 }, { row: rows.length - 1, col: visibleWidth(rows.at(-1)!.trimEnd()) - 1 });
}

for (const implicit of [false, true]) {
	test(`fullscreen drag-copy joins a word-wrapped paragraph (implicit ScrollView=${implicit})`, async (t) => {
		const { terminal, tui, plain, copies } = fixture(t, PARAGRAPH, 24, implicit);
		assert.ok(plain.length > 3);
		selectAll(terminal, plain);
		assert.deepEqual(copies, [PARAGRAPH]);
		tui.renderNow();
		await terminal.flush();
		assert.deepEqual(
			terminal
				.getViewport()
				.slice(0, plain.length)
				.map((line) => line.trimEnd()),
			plain.map((line) => line.trimEnd()),
		);
		assert.ok(
			terminal.writes.every((write) => !write.includes(SOFT_WRAP_MARKER) && !write.includes(SOFT_WRAP_SPACE_MARKER)),
		);
		assert.equal(areSoftWrapMarkersEnabled(), false);
	});
}

for (const text of [
	"한국어문단이화면너비에맞추어여러줄로접히더라도복사한문장은글자사이에공백없이이어져야합니다.",
	"한국어 문장이 여러 줄에 걸쳐 접혀도 단어 사이에만 공백을 남겨야 합니다. English words too.",
	"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
	"prefix abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 suffix",
	"Cafe\u0301🎯Cafe\u0301🎯Cafe\u0301🎯Cafe\u0301🎯Cafe\u0301🎯Cafe\u0301🎯",
]) {
	test(`fullscreen joins preserve word, CJK, and grapheme boundaries: ${text.slice(0, 20)}`, (t) => {
		const { terminal, plain, copies } = fixture(t, text);
		selectAll(terminal, plain);
		assert.deepEqual(copies, [text]);
	});
}

test("styled inline spans copy without padding or control sequences", (t) => {
	const { terminal, plain, copies } = fixture(
		t,
		"A **bold paragraph with several words** then `code` and more words at the end.",
	);
	selectAll(terminal, plain);
	assert.deepEqual(copies, ["A bold paragraph with several words then code and more words at the end."]);
});

for (const text of [
	`${PARAGRAPH}\n\n${PARAGRAPH}`,
	`${PARAGRAPH}\nA literal newline stays here.`,
	`${PARAGRAPH}  \nA Markdown hard break stays here.`,
]) {
	test(`real line and paragraph breaks remain hard: ${JSON.stringify(text.slice(90, 115))}`, (t) => {
		const { terminal, plain, copies } = fixture(t, text);
		selectAll(terminal, plain);
		const expected = text
			.replace(/ {2}\n/g, "\n")
			.split("\n")
			.map((line, index) => (index > 0 && line ? ` ${line}` : line))
			.join("\n");
		assert.deepEqual(copies, [expected]);
	});
}

for (const text of [
	`- ${PARAGRAPH}\n- second item`,
	`\`\`\`\n${PARAGRAPH}\nsecond line\n\`\`\``,
	`> ${PARAGRAPH}`,
	`# ${PARAGRAPH}`,
	`| A | B |\n|---|---|\n| ${PARAGRAPH} | value |`,
]) {
	test(`non-paragraph Markdown keeps today's row-by-row copying: ${text.slice(0, 10)}`, (t) => {
		const { terminal, plain, copies } = fixture(t, text);
		selectAll(terminal, plain);
		assert.deepEqual(copies, [plain.map((row, index) => (index === 0 ? row.slice(1) : row).trimEnd()).join("\n")]);
	});
}

test("partial and reversed selections join only the selected text", (t) => {
	const { terminal, tui, plain, copies } = fixture(t, PARAGRAPH);
	const first = plain[0].trimEnd();
	const second = plain[1].trim();
	const expected = `${first.slice(3)} ${second.slice(0, 7)}`.trimEnd();
	drag(terminal, { row: 0, col: 3 }, { row: 1, col: 7 });
	assert.equal(copies.at(-1), expected);
	tui.resetTextSelection();
	drag(terminal, { row: 1, col: 7 }, { row: 0, col: 3 });
	assert.equal(copies.at(-1), expected);
});

test("a selection ending in the continuation margin does not add an unselected space", (t) => {
	const { terminal, plain, copies } = fixture(t, PARAGRAPH);
	drag(terminal, { row: 0, col: 1 }, { row: 1, col: 0 });
	assert.deepEqual(copies, [plain[0].trim()]);
});

test("opt-out copies exactly the previous rows and emits identical screen bytes", (t) => {
	const enabled = fixture(t, PARAGRAPH);
	const previous = process.env.PI_TUI_SOFT_WRAP;
	process.env.PI_TUI_SOFT_WRAP = "0";
	try {
		const disabled = fixture(t, PARAGRAPH);
		assert.deepEqual(disabled.terminal.writes, enabled.terminal.writes);
		selectAll(disabled.terminal, disabled.plain);
		assert.deepEqual(disabled.copies, [
			disabled.plain.map((line, index) => (index === 0 ? line.slice(1) : line).trimEnd()).join("\n"),
		]);
	} finally {
		if (previous === undefined) delete process.env.PI_TUI_SOFT_WRAP;
		else process.env.PI_TUI_SOFT_WRAP = previous;
	}
});

test("Markdown outside a ScrollView also joins its screen selection", (t) => {
	const { tui, terminal, md, plain, copies } = fixture(t, PARAGRAPH);
	tui.setLayoutRoot(md);
	tui.renderNow();
	selectAll(terminal, plain);
	assert.deepEqual(copies, [PARAGRAPH]);
});

test("overlay screen selections cannot join unrelated rows", (t) => {
	const { tui, terminal, md, plain, copies } = fixture(t, PARAGRAPH);
	tui.setLayoutRoot(md);
	tui.showOverlay(new Text("overlay text", 0, 0), { row: 1, col: 0, width: 24 });
	tui.renderNow();
	drag(terminal, { row: 0, col: 1 }, { row: 1, col: 11 });
	assert.deepEqual(copies, [`${plain[0].trim()}\noverlay text`]);
});

test("a flash overwriting a continuation row cannot join unrelated screen text", (t) => {
	const { tui, terminal, md, copies } = fixture(t, PARAGRAPH);
	tui.setLayoutRoot(md);
	terminal.resize(24, 3);
	tui.flash("notice", 5000);
	tui.renderNow();
	const rows = tui.getScreenLines().map(stripTerminalSequences);
	assert.ok(rows[0].includes("notice"));
	drag(terminal, { row: 0, col: 1 }, { row: 1, col: 23 });
	assert.deepEqual(copies, [`${rows[0].slice(1).trimEnd()}\n${rows[1].trimEnd()}`]);
});

test("plain Text and screen selections outside a ScrollView keep hard newlines", (t) => {
	const { tui, terminal, copies } = fixture(t, PARAGRAPH);
	tui.setLayoutRoot(new Text("first row\nsecond row", 0, 0));
	tui.renderNow();
	drag(terminal, { row: 0, col: 0 }, { row: 1, col: 9 });
	assert.deepEqual(copies, ["first row\nsecond row"]);
});

test("a docked ScrollView retains copy metadata through scrollbar layout and scrolling", (t) => {
	const { tui, terminal, md, copies } = fixture(t, PARAGRAPH);
	const scroll = new ScrollView(md, { primary: true, scrollbar: "always" });
	tui.setLayoutRoot(new VStack([{ component: scroll, basis: 3 }, new Text("dock", 0, 0)]));
	tui.renderNow();
	scroll.scrollTo(1);
	tui.renderNow();
	const rows = md.render(23).map(stripTerminalSequences);
	drag(terminal, { row: 0, col: 1 }, { row: 1, col: rows[2].trimEnd().length - 1 });
	assert.deepEqual(copies, [`${rows[1].trim()} ${rows[2].trim()}`]);
});

test("streaming and resizing refresh copy boundaries rather than reusing old metadata", (t) => {
	const { tui, terminal, md, copies } = fixture(t, PARAGRAPH);
	for (const [text, width] of [
		[PARAGRAPH.slice(0, 50), 24],
		[PARAGRAPH, 30],
		["a short paragraph", 30],
	] as const) {
		md.setText(text);
		terminal.resize(width, 40);
		tui.resetTextSelection();
		tui.renderNow();
		selectAll(terminal, md.render(width).map(stripTerminalSequences));
		assert.equal(copies.at(-1), text);
	}
});

test("markers do not change search matches, word selection, or standalone Markdown", (t) => {
	const { tui, terminal, md, plain, copies } = fixture(t, PARAGRAPH);
	setSoftWrapMarkersEnabled(true);
	let marked: string[];
	try {
		marked = md.render(24);
	} finally {
		setSoftWrapMarkersEnabled(false);
	}
	assert.ok(marked.some((line) => line.includes(SOFT_WRAP_MARKER)));
	assert.deepEqual(
		findAltScreenSearchMatches(marked, "paragraph should"),
		findAltScreenSearchMatches(plain, "paragraph should"),
	);
	assert.deepEqual(md.render(24).map(stripTerminalSequences), plain);
	// Two presses on the same word select the same terminal-cell range with markers enabled.
	for (let click = 0; click < 2; click++) {
		terminal.sendInput("\x1b[<0;4;1M");
		terminal.sendInput("\x1b[<0;4;1m");
	}
	assert.deepEqual(copies, ["copied"]);
	tui.renderNow();
	assert.equal(areSoftWrapMarkersEnabled(), false);
});

test("OSC hyperlinks copy cleanly and rendered search highlights ignore wrap markers", async (t) => {
	const capabilities = getCapabilities();
	setCapabilities({ ...capabilities, hyperlinks: true });
	t.after(() => setCapabilities(capabilities));
	const { tui, terminal, md, copies } = fixture(
		t,
		"A [linked paragraph with several wrapped words](https://example.com) then more prose.",
	);
	selectAll(terminal, md.render(24).map(stripTerminalSequences));
	assert.deepEqual(copies, ["A linked paragraph with several wrapped words then more prose."]);
	// Exercise the actual two-layout search render, not only the index helper.
	tui.resetTextSelection();
	terminal.resize(80, 40);
	tui.renderNow();
	terminal.sendInput("\x1b[102;6u");
	terminal.sendInput("paragraph");
	tui.renderNow();
	await terminal.flush();
	assert.ok(terminal.getViewport().some((line) => line.includes("1/1")));
	assert.ok(tui.getScreenLines()[0].includes("\x1b[1;7mparagraph\x1b[22;27m"));
	assert.equal(areSoftWrapMarkersEnabled(), false);
});

test("a failed fullscreen render restores the marker context", (t) => {
	const { tui } = fixture(t, PARAGRAPH);
	const broken: Component = {
		render: () => {
			throw new Error("failed layout");
		},
		invalidate: () => {},
	};
	tui.setLayoutRoot(broken);
	assert.throws(() => tui.renderNow(), /failed layout/);
	assert.equal(areSoftWrapMarkersEnabled(), false);
	// Avoid rendering the broken root while stopping.
	tui.setLayoutRoot(new Text("restored", 0, 0));
});

test("copy join metadata reconstructs styled text at different word and token boundaries", () => {
	for (const text of [
		PARAGRAPH,
		"alpha    beta gamma    delta",
		"한국어 문장과 English words를 섞어서 공백을 보존합니다.",
		"prefix abcdefghijklmnopqrstuvwxyz0123456789 suffix",
		"alpha\x1b[31m beta gamma\x1b[39m delta",
		"\x1b[4malpha beta gamma delta\x1b[24m",
	]) {
		for (let width = 4; width <= 40; width++) {
			const spaces: boolean[] = [];
			const rows = wrapTextWithAnsi(text, width, undefined, spaces).map(stripTerminalSequences);
			assert.equal(rows.length, spaces.length);
			const joined = rows
				.map((row, index) => row.trim() + (index < rows.length - 1 && spaces[index] ? " " : ""))
				.join("");
			assert.equal(
				joined.replace(/ +/g, " "),
				stripTerminalSequences(text).replace(/ +/g, " "),
				`${text}, width=${width}`,
			);
		}
	}
});

test("wrap join metadata is row-aligned and distinguishes whitespace from token/CJK breaks", () => {
	for (const [text, width, expected] of [
		["alpha beta gamma", 10, [true, false]],
		["abcdefghijklm", 5, [false, false, false]],
		["한국어문장입니다", 6, [false, false, false]],
		["alpha abcdefghijklm", 6, [true, false, false, false]],
		["alpha\nbeta gamma delta", 10, [false, true, false]],
		["alpha     ", 5, [false]],
		["", 5, [false]],
	] as const) {
		const continued: boolean[] = [];
		const spaces: boolean[] = [];
		const rows = wrapTextWithAnsi(text, width, continued, spaces);
		assert.deepEqual(rows, wrapTextWithAnsi(text, width));
		assert.equal(spaces.length, rows.length, text);
		assert.equal(continued.length, rows.length, text);
		assert.deepEqual(spaces, expected, text);
	}
});
