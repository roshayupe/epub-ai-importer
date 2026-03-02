import { unzipSync } from "fflate";

/**
 * Unzip EPUB file into a map of file paths -> file bytes.
 */
export async function unzipEpubFile(
  file: File
): Promise<Record<string, Uint8Array>> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  return unzipSync(bytes);
}