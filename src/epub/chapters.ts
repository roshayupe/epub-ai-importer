import { strFromU8 } from "fflate";
import { extractSpineHtmlFiles } from "./spine";

/**
 * Chapter structure extracted from EPUB.
 */
export interface Chapter {
  index: number;
  sourceFile: string;
  title: string;
  text: string;
}

/**
 * Extract ordered chapters with cleaned text and detected titles.
 */
export function extractChapters(
  unzipped: Record<string, Uint8Array>
): Chapter[] {
  const spineFiles = extractSpineHtmlFiles(unzipped);

  const chapters: Chapter[] = [];

  spineFiles.forEach((filePath, i) => {
    const rawHtml = strFromU8(unzipped[filePath]);

    const title =
      extractHeading(rawHtml) ||
      deriveTitleFromFilename(filePath) ||
      `Chapter ${i + 1}`;

    const text = stripHtml(rawHtml);

    chapters.push({
      index: i + 1,
      sourceFile: filePath,
      title,
      text
    });
  });

  return chapters;
}

/**
 * Attempt to extract chapter title from <h1> or <h2>.
 */
function extractHeading(html: string): string | null {
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h1Match) {
    return cleanInlineTags(h1Match[1]);
  }

  const h2Match = html.match(/<h2[^>]*>(.*?)<\/h2>/i);
  if (h2Match) {
    return cleanInlineTags(h2Match[1]);
  }

  return null;
}

/**
 * Clean inline HTML tags inside heading.
 */
function cleanInlineTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Derive readable title from file name.
 */
function deriveTitleFromFilename(path: string): string | null {
  const fileName = path.split("/").pop();
  if (!fileName) return null;

  const base = fileName.replace(/\.(xhtml|html|htm)$/i, "");

  // Ignore common non-chapter names
  if (/cover|toc|nav|title/i.test(base)) {
    return null;
  }

  return base
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Remove HTML tags and normalize whitespace.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|br|li|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}