import { visibleWidth } from "../utils.ts";

const listStart = /^\s*(?:[-*+] |\d+[.)] )/;
const blockStart = /^\s*(?:#{1,6}(?:\s|$)|>|[-*_](?:\s*[-*_]){2,}\s*$)/;
const cjkEnd = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u;
const cjkStart = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * Best-effort recovery of prose copied from terminal-width rows. Never flatten all
 * newlines: the clipboard no longer says which breaks were originally soft wraps.
 * Only remove a boundary with a near-full preceding row and a shallow margin on
 * the continuation; leave ambiguous blocks and every untouched row byte-for-byte.
 */
export function unwrapSoftWrappedPaste(text: string): string {
	if (!text.includes("\n")) return text;

	const lines = text.split("\n");
	const widths = lines.map((line) => visibleWidth(line.trimEnd()));
	// The source pane may be narrower than the destination terminal. Infer its
	// wrap width from the copied rows, allowing room for word-wrapped long tokens.
	const sourceWidth = widths.reduce((longest, width) => Math.max(longest, width), 0);
	const slack = Math.max(12, Math.floor(sourceWidth / 5));
	// Very short rows are not enough evidence to rewrite text.
	const minimumWidth = Math.max(40, sourceWidth - slack);
	const result: string[] = [];
	let fence: { character: string; length: number } | undefined;
	let previousProtected = true;

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]!;
		const fenceMatch = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
		const inFence = fence !== undefined;
		if (fenceMatch) {
			const marker = fenceMatch[1]!;
			if (!fence) {
				fence = { character: marker[0]!, length: marker.length };
			} else if (marker[0] === fence.character && marker.length >= fence.length && !fenceMatch[2]!.trim()) {
				fence = undefined;
			}
		}

		const isListItem = listStart.test(line);
		const indentation = /^[ \t]*/.exec(line)![0];
		const protectedLine =
			inFence ||
			fenceMatch !== null ||
			!line.trim() ||
			blockStart.test(line) ||
			line.includes("|") ||
			(!isListItem && (indentation.includes("\t") || indentation.length >= 4));
		const previous = lines[index - 1];
		const join =
			previous !== undefined &&
			!previousProtected &&
			!protectedLine &&
			!isListItem &&
			/^ {1,2}\S/.test(line) &&
			!/(?:[{[(;\\]|=>)$/.test(previous.trimEnd()) &&
			!/^\s*[}\])]/.test(line) &&
			widths[index - 1]! >= minimumWidth;

		if (join) {
			const before = result[result.length - 1]!.trimEnd();
			const after = line.trimStart();
			const separator = cjkEnd.test(before) && cjkStart.test(after) ? "" : " ";
			result[result.length - 1] = before + separator + after;
		} else {
			result.push(line);
		}

		previousProtected = protectedLine;
	}

	return result.join("\n");
}
