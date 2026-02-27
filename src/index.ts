
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

type Env = {
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "book";
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|br|li|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkWords(text: string, targetWords = 1200) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += targetWords) {
    chunks.push(words.slice(i, i + targetWords).join(" "));
  }
  return chunks;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAIForLesson(env: Env, chunkText: string, lessonTitle: string) {
  const model = env.OPENAI_MODEL || "gpt-4.1-mini";

  const body = {
    model,
    input: `Extract vocabulary as JSON.\n\nTITLE: ${lessonTitle}\n\nTEXT:\n${chunkText}`
  };

  const r = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, 65000);

  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`OpenAI error ${r.status}: ${errText}`);
  }

  const data: any = await r.json();
  const outText = data.output_text ?? null;
  if (!outText) throw new Error("OpenAI: missing output_text");
  return JSON.parse(outText);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/") {
        return new Response("EPUB Importer running", {
          headers: { "Content-Type": "text/plain" }
        });
      }

      if (request.method !== "POST" || url.pathname !== "/import") {
        return new Response("Not found", { status: 404 });
      }

      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return new Response("Missing file", { status: 400 });
      }

      const seriesTitle = String(form.get("seriesTitle") || "Standalone");
      const bookTitle = String(form.get("bookTitle") || file.name.replace(/\.epub$/i, ""));
      const author = String(form.get("author") || "Unknown");

      const maxFragments = Math.max(1, Number(form.get("maxFragments") || 3));
      const targetWords = Number(form.get("targetWords") || 1200);

      const seriesId = slugify(seriesTitle);
      const bookId = slugify(bookTitle);

      const epubBytes = new Uint8Array(await file.arrayBuffer());
      const unzipped = unzipSync(epubBytes);

      const htmlFiles = Object.keys(unzipped).filter(p =>
        /\.(xhtml|html|htm)$/i.test(p)
      );

      let combinedText = "";
      for (const p of htmlFiles) {
        combinedText += "\n\n" + stripHtml(strFromU8(unzipped[p]));
      }

      const chunks = chunkWords(combinedText, targetWords).slice(0, maxFragments);

      const lessons: any[] = [];
      let partialError: any = null;

      for (let i = 0; i < chunks.length; i++) {
        try {
          const lessonTitle = `${bookTitle} — Fragment ${i + 1}`;
          const lesson = await callOpenAIForLesson(env, chunks[i], lessonTitle);
          lessons.push({ index: i + 1, lesson });
        } catch (e) {
          partialError = { fragment: i + 1, error: String(e) };
          break;
        }
      }

      const zipFiles: Record<string, Uint8Array> = {};

      for (const x of lessons) {
        zipFiles[`lesson_${x.index}.json`] = strToU8(JSON.stringify(x.lesson, null, 2));
      }

      if (partialError) {
        zipFiles["import_error.json"] = strToU8(JSON.stringify(partialError, null, 2));
      }

      const zipped = zipSync(zipFiles, { level: 6 });

      return new Response(zipped, {
        status: partialError ? 206 : 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${seriesId}_${bookId}.zip"`
        }
      });

    } catch (e: any) {
      return new Response(`Importer error: ${e?.message || String(e)}`, { status: 500 });
    }
  }
};
