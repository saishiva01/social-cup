/**
 * Minimal, safe CSV generation for admin exports (PRD Module 9: "export one
 * cafe's redemptions to CSV as their monthly statement"). Shared by every
 * admin export so escaping/formula-injection behavior lives in exactly one
 * place rather than being re-implemented per route.
 */

/** Characters that a spreadsheet application (Excel, Sheets, LibreOffice) treats as the start of a formula. */
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Escapes one CSV field per RFC 4180 and neutralizes formula injection: a
 * cell whose first character would make a spreadsheet application interpret
 * it as a formula (=, +, -, @) is prefixed with a leading apostrophe, which
 * every mainstream spreadsheet renders as literal text. Applied to every
 * cell, not just string-looking ones, since a crafted numeric-looking string
 * (e.g. a reference note field) is exactly the injection vector.
 */
export function toCsvCell(value: string | number | boolean | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);

  if (text.length > 0 && FORMULA_TRIGGER_CHARS.has(text[0]!)) {
    text = `'${text}`;
  }

  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

/**
 * Builds a full CSV document (header row + data rows), CRLF line endings per
 * RFC 4180, with a leading UTF-8 BOM so Excel opens non-ASCII content
 * correctly. `rows` must already be in the exact column order `headers`
 * declares — this function does not reorder or look up fields by name.
 */
export function buildCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): string {
  const lines = [headers.map(toCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(toCsvCell).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
