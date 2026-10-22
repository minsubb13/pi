import { isImageLine } from "./terminal-image.ts";
import { stripTerminalSequences, visibleWidth } from "./utils.ts";

/** A continued visual row; extracted before any bytes reach the terminal. */
export const SOFT_WRAP_MARKER = "\x1b_pi:w\x07";
/** Paired with SOFT_WRAP_MARKER when copying the join needs one word-separating space. */
export const SOFT_WRAP_SPACE_MARKER = "\x1b_pi:ws\x07";
/** The next visual row of the same paragraph; both sides must survive clipping. */
export const SOFT_WRAP_START_MARKER = "\x1b_pi:wc\x07";

const OSC133_ZONE_PREFIX = /^(?:\x1b\]133;[ABC](?:\x07|\x1b\\))+/;

// Only enabled while a renderer synchronously renders its component tree.
// Standalone Markdown consumers keep ordinary hard rows.
let softWrapMarkersEnabled = false;

export function setSoftWrapMarkersEnabled(enabled: boolean): void {
	softWrapMarkersEnabled = enabled;
}

export function areSoftWrapMarkersEnabled(): boolean {
	return softWrapMarkersEnabled;
}

export function stripSoftWrapMarkers(line: string): string {
	return line
		.replaceAll(SOFT_WRAP_MARKER, "")
		.replaceAll(SOFT_WRAP_SPACE_MARKER, "")
		.replaceAll(SOFT_WRAP_START_MARKER, "");
}

/** Allow padding/background wrappers, but never a visible border or unrelated text. */
export function getSoftWrapJoin(previous: string, line: string): "none" | "join" | "space" {
	if (isImageLine(previous) || isImageLine(line) || !stripTerminalSequences(line).trim()) return "none";
	const end = previous.replace(/(?: |\x1b\[[0-9:;]*m|\x1b\]8;;(?:\x07|\x1b\\))*$/, "");
	const start = line.replace(/^(?: |\x1b\[[0-9:;]*m|\x1b\]133;[ABC](?:\x07|\x1b\\))*/, "");
	if (!end.endsWith(SOFT_WRAP_MARKER) || !start.startsWith(SOFT_WRAP_START_MARKER)) return "none";
	return end.endsWith(SOFT_WRAP_SPACE_MARKER + SOFT_WRAP_MARKER) ? "space" : "join";
}

export function extractSoftWrapRows(
	rows: string[],
	width: number,
	allow: boolean,
): { lines: string[]; continued: boolean[] } {
	const lines = rows.map(stripSoftWrapMarkers);
	const continued = rows.map(
		(line, index) =>
			allow &&
			line.endsWith(SOFT_WRAP_MARKER) &&
			index + 1 < lines.length &&
			rows[index + 1].replace(OSC133_ZONE_PREFIX, "").startsWith(SOFT_WRAP_START_MARKER) &&
			!isImageLine(lines[index]) &&
			!isImageLine(lines[index + 1]) &&
			visibleWidth(lines[index + 1]) > 0 &&
			visibleWidth(lines[index]) === width,
	);
	return { lines, continued };
}
