const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const MULTI_NEWLINE_REGEX = /\n{3,}/g;
const SPACE_BEFORE_NEWLINE_REGEX = /[ \t]+\n/g;

export interface PreprocessResult {
  text: string;
  removedCharacters: number;
  normalizedWhitespace: boolean;
}

export function preprocessRawText(raw?: string | null): PreprocessResult {
  if (!raw) {
    return { text: "", removedCharacters: 0, normalizedWhitespace: false };
  }
  const withoutControl = raw.replace(CONTROL_CHAR_REGEX, " ");
  const normalizedNewlines = withoutControl.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
  const collapsed = normalizedNewlines
    .replace(SPACE_BEFORE_NEWLINE_REGEX, "\n")
    .replace(MULTI_NEWLINE_REGEX, "\n\n")
    .trim();
  return {
    text: collapsed,
    removedCharacters: raw.length - withoutControl.length,
    normalizedWhitespace: collapsed !== raw
  };
}
