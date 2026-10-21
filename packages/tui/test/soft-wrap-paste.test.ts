import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Editor } from "../src/components/editor.ts";
import { unwrapSoftWrappedPaste } from "../src/components/soft-wrap-paste.ts";
import { TuiMainScreen } from "../src/tui-main-screen.ts";
import { defaultEditorTheme } from "./test-themes.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

const piRows = [
	"Actually, the newer codex default for fullscreen_transcript is true, meaning codex now manages its own",
	" selection in the transcript, similar to Claude Code, rather than relying on regular terminal mode—which",
	" explains why copy works there. I should check which codex version the user has installed and what their",
	" config looks like.",
];
const codexRows = [
	"1. Kernel implementation survey. The structural claims of the adopted candidates were compared with the production code, code/paper1/gpu-faest-poc/v3/src on paper/faest-gpu-v3",
	"  at 00d82ee. No test was run again; the gate evidence comes from STATE.md (389 tests local, 403 a5000).",
	"     - Confirmed: A2 (four sections joined by powers of s and t; 14 prover streams, 2 verifier streams), A3 (the prefix sections keep only streams 5, 6, 12 and 13), B1 (one",
	"  kernel per role, __syncwarp only, 1/2/4/8 warps per block), B2 and B3 (KAT splices for 12 sets x 2 roles), B4 (EM round keys as views, no stored array), C1 and C2 (the",
	"  Karatsuba flag reaches all eight 192/256 units).",
];
const fullRow = "This is ordinary prose copied from a terminal and it fills nearly the entire row.";

function createEditor(columns = 80): Editor {
	return new Editor(new TuiMainScreen(new VirtualTerminal(columns, 24)), defaultEditorTheme);
}

function paste(editor: Editor, text: string): void {
	editor.handleInput(`\x1b[200~${text}\x1b[201~`);
}

// Related upstream reports: earendil-works/pi#5931 and #8019. This personal
// workaround recovers likely wraps on input; it does not change terminal copy.
describe("unwrapSoftWrappedPaste", () => {
	it("joins the operator's pi sample with one-space continuation margins", () => {
		assert.equal(unwrapSoftWrappedPaste(piRows.join("\n"), 105), piRows.map((line) => line.trim()).join(" "));
	});

	it("joins the operator's Codex sample without merging its numbered and nested bullet items", () => {
		const expected = `${codexRows[0]} ${codexRows[1]!.trim()}\n${codexRows[2]} ${codexRows[3]!.trim()} ${codexRows[4]!.trim()}`;
		assert.equal(unwrapSoftWrappedPaste(codexRows.join("\n"), 170), expected);
	});

	it("uses the widest copied row when the source terminal was wider", () => {
		assert.equal(unwrapSoftWrappedPaste(codexRows.join("\n"), 80), unwrapSoftWrappedPaste(codexRows.join("\n"), 170));
	});

	it("preserves short lines, short indented messages, and single-line text exactly", () => {
		for (const text of ["hi\nthere", " hello\n there\n", "    untouched indentation", "\n\n", ""]) {
			assert.equal(unwrapSoftWrappedPaste(text, 80), text);
		}
	});

	it("does not use accumulated paragraph length as evidence for a later short boundary", () => {
		const text = `${fullRow}\n short continuation.\n a separate instruction`;
		assert.equal(unwrapSoftWrappedPaste(text, 80), `${fullRow} short continuation.\n a separate instruction`);
	});

	it("requires a continuation margin rather than flattening arbitrary full-width lines", () => {
		const text = `${fullRow}\nThis line has no terminal margin.`;
		assert.equal(unwrapSoftWrappedPaste(text, 80), text);
	});

	it("preserves new bullet and numbered items even after full-width rows", () => {
		const text = `- ${fullRow}\n - another item\n 1. numbered item\n + final item`;
		assert.equal(unwrapSoftWrappedPaste(text, 80), text);
	});

	it("preserves paragraph boundaries, including blank rows with padding", () => {
		const text = `${fullRow}\n     \n new paragraph\n`;
		assert.equal(unwrapSoftWrappedPaste(text, 80), text);
	});

	it("preserves backtick and tilde fences, even with longer text and shorter inner fences", () => {
		for (const marker of ["````", "~~~~"]) {
			const text = ` ${marker}ts\n ${fullRow}\n ${marker.slice(0, 3)}\n ${fullRow}\n code continuation\n ${marker}\n`;
			assert.equal(unwrapSoftWrappedPaste(text, 80), text);
		}
	});

	it("preserves indented code and does not join following shallow text onto it", () => {
		for (const indent of ["    ", "\t"]) {
			const text = `${indent}${fullRow}\n${indent}return value;\n ordinary prose`;
			assert.equal(unwrapSoftWrappedPaste(text, 80), text);
		}
	});

	it("preserves un-fenced code-like boundaries and shell line continuations", () => {
		const functionHeader = `function foo(${"argument, ".repeat(7)}lastArgument) {`;
		for (const text of [
			`${functionHeader}\n  return 1;`,
			`${fullRow} \\\n  --next`,
			...["{", "[", "(", ";", "=>"].map((ending) => `${fullRow}${ending}\n  next instruction`),
			...["}", "]", ")"].map((start) => `${fullRow}\n  ${start}`),
		]) {
			assert.equal(unwrapSoftWrappedPaste(text, 80), text);
		}
	});

	it("preserves table rows, headings, quotes, and separators on either side", () => {
		for (const row of [` | ${fullRow} |`, ` # ${fullRow}`, ` > ${fullRow}`, ` ${"-".repeat(79)}`]) {
			assert.equal(unwrapSoftWrappedPaste(`${row}\n continuation`, 80), `${row}\n continuation`);
			assert.equal(unwrapSoftWrappedPaste(`${fullRow}\n${row}`, 80), `${fullRow}\n${row}`);
		}
	});

	it("removes padding only at joined boundaries and keeps the final newline", () => {
		const text = `${fullRow}   \n continuation   \n`;
		assert.equal(unwrapSoftWrappedPaste(text, 80), `${fullRow} continuation   \n`);
	});

	it("uses terminal column width for CJK and joins CJK characters without a space", () => {
		const row = "이".repeat(39);
		assert.equal(unwrapSoftWrappedPaste(`${row}\n 어진문장`, 80), `${row}어진문장`);
	});

	it("keeps a separator for Latin-to-CJK and CJK-to-Latin word boundaries", () => {
		assert.equal(unwrapSoftWrappedPaste(`${fullRow}\n 다음`, 80), `${fullRow} 다음`);
		const row = "이".repeat(39);
		assert.equal(unwrapSoftWrappedPaste(`${row}\n next`, 80), `${row} next`);
	});

	it("does not infer soft wrapping from tiny viewport widths", () => {
		assert.equal(unwrapSoftWrappedPaste("hello\n world", 5), "hello\n world");
	});
});

describe("Editor soft-wrap paste integration", () => {
	it("normalizes line endings and unwraps the pi fixture through bracketed paste", () => {
		const editor = createEditor(105);
		paste(editor, piRows.join("\r\n"));
		assert.equal(editor.getText(), piRows.map((line) => line.trim()).join(" "));
	});

	it("unwraps before storing large-paste content and expands it on submission", () => {
		const editor = createEditor();
		const rows = Array.from({ length: 20 }, () => ` ${fullRow}`);
		const expected = ` ${Array.from({ length: 20 }, () => fullRow).join(" ")}`;
		paste(editor, rows.join("\n"));
		assert.match(editor.getText(), /^\[paste #1 \d+ chars\]$/);
		assert.equal(editor.getExpandedText(), expected);
		let submitted: string | undefined;
		editor.onSubmit = (text) => {
			submitted = text;
		};
		editor.handleInput("\r");
		assert.equal(submitted, expected.trim());
	});

	it("unwraps before deciding whether a paste still needs a large marker", () => {
		const editor = createEditor(50);
		const row = "This sentence is long enough to fill this row.";
		paste(editor, Array.from({ length: 11 }, () => ` ${row}`).join("\n"));
		assert.equal(editor.getText(), ` ${Array.from({ length: 11 }, () => row).join(" ")}`);
	});

	it("keeps indented code after tab normalization", () => {
		const editor = createEditor();
		paste(editor, `\t${fullRow}\n\treturn value;`);
		assert.equal(editor.getText(), `    ${fullRow}\n    return value;`);
	});

	it("does not apply paste heuristics to programmatic insertion or setText", () => {
		const editor = createEditor();
		const text = `${fullRow}\n continuation`;
		editor.setText(text);
		assert.equal(editor.getText(), text);
		editor.setText("");
		editor.insertTextAtCursor(text);
		assert.equal(editor.getText(), text);
	});
});
