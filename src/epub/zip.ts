import { zipSync, strToU8 } from "fflate";

/**
 * Convert JSON object map to zipped archive.
 */
export function zipJsonFiles(
  files: Record<string, unknown>
): Uint8Array {
  const zipMap: Record<string, Uint8Array> = {};

  for (const key in files) {
    zipMap[key] = strToU8(
      JSON.stringify(files[key], null, 2)
    );
  }

  return zipSync(zipMap, { level: 6 });
}