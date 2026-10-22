#!/usr/bin/env node
import { once } from "node:events";
import { pathToFileURL } from "node:url";

/** Pure byte sequences; the emulator checks the script, not Ghostty/herdr copy behavior. */
export function createProbe(columns) {
	if (!Number.isInteger(columns) || columns < 80) throw new Error("Use a terminal at least 80 columns wide.");
	const sentence = "Terminal copying should preserve words without adding line breaks or padding spaces. ";
	const words = `CASE_P_BEGIN ${sentence.repeat(Math.ceil((columns * 2) / sentence.length))} CASE_P_END`.split(" ");
	const rows = [];
	let current = "";
	for (const word of words) {
		if (current && current.length + 1 + word.length > columns - 2) {
			rows.push(current);
			current = word;
		} else {
			current += `${current ? " " : ""}${word}`;
		}
	}
	rows.push(current);
	const hard = "CASE_Q_BEGIN This is a separate logical line. CASE_Q_END";
	const short = "CASE_P_BEGIN Shortened paragraph. CASE_P_END";
	const origin = "\x1b[5;1H";
	const padded = rows.map((row, index) => ` ${row}${index < rows.length - 1 ? " ".repeat(columns - row.length - 1) : ""}`).join("");
	const sparse = rows.map((row, index) => ` ${row}${index < rows.length - 1 ? `\x1b[K\x1b[${columns}G ` : ""}`).join("");
	const baseline = `${padded}\r\n ${hard}\r\n`;
	const header = (title, instruction) => `\x1b[2J\x1b[H${title}\r\n${instruction}\r\nCopy into a plain editor, NOT pi. Do not resize. Enter advances.\r\n${origin}`;
	const stages = [
		{ id: "a", title: "A: pi-shaped rows (written padding)", output: header("A: pi-shaped rows", "Copy P only: one line? Extra spaces between words?") + baseline },
		{ id: "b", title: "B: sparse padding (erased cells, cursor to last column)", output: header("B: sparse padding", "Copy P only: one line? Extra spaces between words?") + sparse + `\r\n ${hard}\r\n` },
		{ id: "c-before", title: "C before: paragraph before contiguous redraw", output: header("C before: paragraph before redraw", "Copy P only now; compare with the next stage.") + baseline },
		{ id: "c-after", title: "C after: whole paragraph redrawn contiguously", output: `${origin}\x1b[2K${padded}\r\n\x1b[2;1HCopy P again: one line? Extra spaces?\x1b[K\x1b[12;1H` },
	];
	const shrinkRedraw = {};
	for (const variant of [1, 2, 3]) {
		stages.push({ id: `d${variant}-before`, title: `D${variant} before: P wraps, Q is separate`, output: header(`D${variant} before: P wraps, Q is separate`, "Copy P and Q: P should join internally; Q should stay separate.") + baseline });
		let redraw = origin;
		for (let index = 0; index <= rows.length; index++) {
			const text = index === 0 ? ` ${short}` : index === 1 ? ` ${hard}` : "";
			if (variant === 3) redraw += "\x1b[M\x1b[L";
			redraw += `\r\x1b[2K${text}`;
			if (variant === 2) redraw += " ".repeat(columns - text.length);
			redraw += "\r\n";
		}
		shrinkRedraw[variant] = redraw;
		stages.push({ id: `d${variant}-after`, title: `D${variant} after: ${["", "ordinary erase/rewrite", "full-width rewrite then CR/LF", "delete+insert line then rewrite"][variant]}`, output: `${redraw}\x1b[2;1HCopy shortened P and Q: MUST be two separate lines.\x1b[K\x1b[12;1H` });
	}
	const retitle = (title, instruction) => `\x1b[1;1H${title}\x1b[K\x1b[2;1H${instruction}\x1b[K`;
	// Default operator run: pi row shape (A), contiguous redraw (C after), pi-like shrink (D2 after).
	const quickStages = [
		{ id: "a", title: "Screen 1/3", output: header("1/3: pi-shaped paragraph", "Copy CASE_P_BEGIN..CASE_P_END: one line? Extra spaces?") + baseline },
		{ id: "c-after", title: "Screen 2/3", output: `${origin}\x1b[2K${padded}\r\n${retitle("2/3: paragraph redrawn", "Copy CASE_P_BEGIN..CASE_P_END again: one line?")}\x1b[12;1H` },
		{ id: "d2-after", title: "Screen 3/3", output: `${shrinkRedraw[2]}${retitle("3/3: paragraph shortened", "Copy CASE_P_BEGIN..CASE_Q_END: MUST be two separate lines.")}\x1b[12;1H` },
	];
	// Follow-up after quick run (Ghostty 2026-10-21: extra spaces, D2 wrong join):
	// sparse padding (B), ordinary rewrite (D1), delete+insert line rewrite (D3).
	const followupStages = [
		{ id: "b", title: "Screen 1/3", output: header("1/3: erased padding", "Copy CASE_P_BEGIN..CASE_P_END: one line? Extra spaces?") + sparse + `\r\n ${hard}\r\n` },
		{ id: "d1-after", title: "Screen 2/3", output: `${shrinkRedraw[1]}${retitle("2/3: shortened (plain rewrite)", "Copy CASE_P_BEGIN..CASE_Q_END: MUST be two separate lines.")}\x1b[12;1H` },
		{ id: "d3-after", title: "Screen 3/3", output: header("3/3: shortened (delete+insert line)", "Copy CASE_P_BEGIN..CASE_Q_END: MUST be two separate lines.") + baseline + shrinkRedraw[3] + "\x1b[12;1H" },
	];
	return { columns, rows, short, hard, stages, quickStages, followupStages };
}

async function waitForEnter() {
	for (;;) {
		const [data] = await once(process.stdin, "data");
		if (data.includes("\x03") || data.includes("\x04")) throw new Error("Probe cancelled.");
		if (data.includes("\r") || data.includes("\n")) return;
	}
}

async function main() {
	if (process.argv.includes("--help")) {
		console.log("Run: node scripts/personal/soft-wrap-probe-v2.mjs [--followup|--full]");
		console.log("--followup: 3 screens (erased padding, plain shrink rewrite, delete+insert shrink rewrite).");
		console.log("Default: 3 screens (pi row shape, redraw, shrink). --full: 10 screens A/B/C/D1-D3.");
		console.log("Report internal newlines, extra spaces, and whether separate P/Q wrongly join.");
		console.log("Do not paste into pi: paste normalization can hide newlines. Use a plain editor.");
		return;
	}
	if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
		throw new Error("Run interactively in Ghostty (not piped or through the agent's bash tool).");
	}
	if ((process.stdout.rows ?? 0) < 16) throw new Error("Use a terminal at least 16 rows high.");
	const probe = createProbe(process.stdout.columns);
	const previousRaw = process.stdin.isRaw;
	let resized = false;
	const onResize = () => { resized = true; };
	process.stdout.on("resize", onResize);
	process.stdin.setRawMode(true);
	process.stdin.resume();
	try {
		const stages = process.argv.includes("--full") ? probe.stages : process.argv.includes("--followup") ? probe.followupStages : probe.quickStages;
		for (const stage of stages) {
			process.stdout.write(stage.output);
			process.stdout.write(`\x1b[12;1H${stage.title}\x1b[K\r\nEnter for next stage; Ctrl+C cancels.\x1b[K`);
			await waitForEnter();
			if (resized) throw new Error("Terminal resized; rerun the probe at a fixed size.");
		}
		process.stdout.write(`\r\nProbe finished (${probe.columns} columns).\r\n`);
	} finally {
		process.stdout.off("resize", onResize);
		process.stdin.setRawMode(previousRaw);
		process.stdin.pause();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		process.stderr.write(`\r\n${error.message}\r\n`);
		process.exitCode = 1;
	});
}
