import { strFromU8 } from "fflate";

/**
 * Extract ordered content documents (XHTML/HTML) from EPUB spine.
 * Returns file paths in correct reading order.
 */
export function extractSpineHtmlFiles(
  unzipped: Record<string, Uint8Array>
): string[] {
  // 1. Locate container.xml
  const containerPath = "META-INF/container.xml";
  const containerFile = unzipped[containerPath];

  if (!containerFile) {
    throw new Error("container.xml not found in EPUB archive");
  }

  const containerXml = strFromU8(containerFile);

  // 2. Extract path to content.opf
  const opfMatch = containerXml.match(/full-path="([^"]+\.opf)"/i);
  if (!opfMatch) {
    throw new Error("content.opf path not found in container.xml");
  }

  const opfPath = opfMatch[1];
  const opfFile = unzipped[opfPath];

  if (!opfFile) {
    throw new Error(`OPF file not found at ${opfPath}`);
  }

  const opfXml = strFromU8(opfFile);

  // 3. Build manifest map: id -> resolved file path
  const manifestMap: Record<string, string> = {};

  const itemRegex =
    /<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*>/gi;

  let itemMatch;
  while ((itemMatch = itemRegex.exec(opfXml)) !== null) {
    const [, id, href] = itemMatch;
    manifestMap[id] = resolveRelativePath(opfPath, href);
  }

  // 4. Extract spine order
  const spineFiles: string[] = [];

  const spineRegex =
    /<itemref\s+[^>]*idref="([^"]+)"[^>]*>/gi;

  let spineMatch;
  while ((spineMatch = spineRegex.exec(opfXml)) !== null) {
    const idref = spineMatch[1];
    const filePath = manifestMap[idref];

    if (
      filePath &&
      /\.(xhtml|html|htm)$/i.test(filePath)
    ) {
      spineFiles.push(filePath);
    }
  }

  return spineFiles;
}

/**
 * Resolve relative href inside OPF to absolute archive path.
 */
function resolveRelativePath(opfPath: string, href: string): string {
  const opfDir = opfPath.substring(
    0,
    opfPath.lastIndexOf("/") + 1
  );

  const fullPath = opfDir + href;

  // Normalize "../" segments
  const parts = fullPath.split("/");
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === "..") {
      resolved.pop();
    } else if (part !== ".") {
      resolved.push(part);
    }
  }

  return resolved.join("/");
}