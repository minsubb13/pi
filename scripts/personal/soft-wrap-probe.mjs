#!/usr/bin/env node
import { once } from "node:events";
import { pathToFileURL } from "node:url";

/** ASCII only: character offsets equal terminal columns for this probe. */
export function createProbe(columns) {
	if (!Number.isInteger(columns) || columns < 40) throw new Error("Use a terminal at least 40 columns wide.");
	const length = Math.floor(columns * 2.5);
	const sentence = "One logical sentence should copy without newlines even when the terminal wraps it visually. ";
	const text = `SOFT_WRAP_BEGIN ${sentence.repeat(Math.ceil(length / sentence.length))}`.slice(0, length - 14);
	const sample = `${text} SOFT_WRAP_END`;
	return {
		sample,
		// Save the sample's origin; write without CR/LF between physical rows.
		initial: `\r\n\x1b7${sample}\r\n`,
		// Redraw only row 2, as pi does. Cursor motion after a full-width write
		// cancels pending autowrap without inserting an explicit newline.
		redraw: `\x1b8\x1b[B\r\x1b[2K${sample.slice(columns, columns * 2)}\x1b8\x1b[3B\r`,
		finish: "\x1b8\x1b[4B\r",
	};
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
		console.log("Run: node scripts/personal/soft-wrap-probe.mjs");
		console.log("In Ghostty, copy BEGIN through END to a plain text editor before and after Enter.");
		console.log("Report whether each copy has internal newlines. Repeat inside herdr.");
		console.log("Do not paste into pi to check: pi-personal may remove those newlines.");
		return;
	}
	if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
		throw new Error("Run interactively in Ghostty (not piped or through the agent's bash tool).");
	}
	if ((process.stdout.rows ?? 0) < 12) throw new Error("Use a terminal at least 12 rows high.");
	const columns = process.stdout.columns;
	const probe = createProbe(columns);
	const previousRaw = process.stdin.isRaw;
	let resized = false;
	const onResize = () => {
		resized = true;
	};
	process.stdout.on("resize", onResize);
	process.stdin.setRawMode(true);
	process.stdin.resume();
	try {
		process.stdout.write("Stage 1: copy BEGIN..END into a plain editor.\r\n");
		process.stdout.write("Check for newlines; Enter redraws row 2.\r\n");
		process.stdout.write("Do not resize, paste here, or use pi to check.\r\n");
		process.stdout.write(probe.initial);
		await waitForEnter();
		if (resized) throw new Error("Terminal resized; rerun the probe at a fixed size.");
		process.stdout.write(probe.redraw);
		process.stdout.write("Stage 2: copy again to the editor; Enter exits.\r\n");
		await waitForEnter();
		if (resized) throw new Error("Terminal resized; rerun the probe at a fixed size.");
		process.stdout.write(probe.finish);
		process.stdout.write(`Probe finished (${columns} columns).\r\n`);
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
