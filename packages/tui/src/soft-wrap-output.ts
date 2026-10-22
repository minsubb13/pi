import { isImageLine } from "./terminal-image.ts";
import { visibleWidth } from "./utils.ts";

/** A continued visual row; extracted before any bytes reach the terminal. */
export const SOFT_WRAP_MARKER = "\x1b_pi:w\x07";

// Only enabled while the regular renderer synchronously renders its component tree.
// Standalone Markdown consumers and the fullscreen renderer keep ordinary hard rows.
let softWrapMarkersEnabled = false;

export function setSoftWrapMarkersEnabled(enabled: boolean): void {
	softWrapMarkersEnabled = enabled;
}

export function areSoftWrapMarkersEnabled(): boolean {
	return softWrapMarkersEnabled;
}

export function extractSoftWrapRows(
	rows: string[],
	width: number,
	allow: boolean,
): { lines: string[]; continued: boolean[] } {
	const lines = rows.map((line) => line.replaceAll(SOFT_WRAP_MARKER, ""));
	const continued = rows.map(
		(line, index) =>
			allow &&
			line.endsWith(SOFT_WRAP_MARKER) &&
			index + 1 < lines.length &&
			!isImageLine(lines[index]) &&
			!isImageLine(lines[index + 1]) &&
			visibleWidth(lines[index + 1]) > 0 &&
			visibleWidth(lines[index]) === width,
	);
	return { lines, continued };
}
