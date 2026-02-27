import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

type Env = {
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string; // optional
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
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
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

async function callOpenAIForLesson(env: Env, chunkText: string, lessonTitle: string) {
  const model = env.OPENAI_MODEL || "gpt-4.1-mini";

  const body = {
    model,
    input:
      "You are a vocabulary extractor for English learners. " +
      "Return ONLY valid JSON that matches the provided schema. " +
      "Use BrE IPA in the ipa field. " +
      "Pick 25-45 useful items from the chunk: single words + a few set phrases. " +
      "Use Type values like Noun/Verb/Adjective/Adverb/Phrase/Other. " +
      "Level should be B1/B2/C1/C2/Unknown. " +
      "example should be a short quote from the chunk (<= 20 words). " +
      "exampleText is the same but without HTML.\n\n" +
      `LESSON TITLE: ${lessonTitle}\n\nTEXT CHUNK:\n${chunkText}`,
  
    text: {
      format: {
        type: "json_schema",
        name: "lesson_schema",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            words: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  word: { type: "string" },
                  ipa: { type: "string" },
                  type: { type: "string" },
                  level: { type: "string" },
                  translation: { type: "string" },
                  definition: { type: "string" },
                  example: { type: "string" },
                  exampleText: { type: "string" }
                },
                required: [
                  "word",
                  "ipa",
                  "type",
                  "level",
                  "translation",
                  "definition",
                  "example",
                  "exampleText"
                ]
              }
            }
          },
          required: ["title", "words"]
        }
      }
    }
  };

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`OpenAI error ${r.status}: ${errText}`);
  }

  const data: any = await r.json();
  const outText =
    data.output_text ??
    data.output?.map((x: any) => x?.content?.map((c: any) => c?.text).join("")).join("") ??
    null;

  if (!outText) throw new Error("OpenAI: missing output_text");
  return JSON.parse(outText);
}

function uiHtml(workerOrigin: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<title>EPUB Importer</title>
<style>
body{background:#121212;color:#eee;font-family:Arial;margin:0;padding:20px}
h1{color:#4da3ff;margin:0 0 12px 0}
.card{background:#1e1e1e;border-radius:14px;padding:14px;max-width:800px}
input,button{width:100%;padding:12px;margin:8px 0;border-radius:10px;border:1px solid #333;background:#121212;color:#eee}
button{cursor:pointer;background:#333}
button:hover{background:#4da3ff;color:#000}
.small{color:#aaa;font-size:13px}
.log{white-space:pre-wrap;background:#121212;border:1px solid #333;border-radius:10px;padding:12px;margin-top:10px}
</style>
</head>
<body>
<h1>EPUB → Lesson JSON (ZIP)</h1>
<div class="card">
  <div class="small">Uploads EPUB, extracts text, chunks ~1200 words, calls AI, returns a ZIP compatible with your library structure.</div>
  <input id="seriesTitle" placeholder="Series (e.g. Chrestomanci Series)"/>
  <input id="bookTitle" placeholder="Book title (optional)"/>
  <input id="author" placeholder="Author (optional)"/>
  <input id="file" type="file" accept=".epub"/>
  <button id="btn">Generate ZIP</button>
  <div class="log" id="log">Ready.</div>
</div>

<script>
const IMPORT_URL = "${workerOrigin}/import";
const logEl = document.getElementById("log");
const btn = document.getElementById("btn");
function log(s){ logEl.textContent = s; }

btn.onclick = async () => {
  try{
    const f = document.getElementById("file").files[0];
    if(!f){ log("Choose .epub file first."); return; }

    const fd = new FormData();
    fd.append("file", f);
    fd.append("seriesTitle", document.getElementById("seriesTitle").value || "Standalone");
    fd.append("bookTitle", document.getElementById("bookTitle").value || "");
    fd.append("author", document.getElementById("author").value || "");

    log("Uploading… generating… (this can take a bit)");
    const r = await fetch(IMPORT_URL, { method:"POST", body: fd });
    if(!r.ok){
      const t = await r.text();
      log("Error: " + t);
      return;
    }
    const blob = await r.blob();
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = "import.zip";
    a.click();
    URL.revokeObjectURL(url);
    log("Done. ZIP downloaded.");
  }catch(e){
    log("Failed: " + e);
  }
};
</script>
</body></html>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/") {
        return new Response(uiHtml(url.origin), {
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return new Response("ok");
      }

      if (request.method !== "POST" || url.pathname !== "/import") {
        return new Response("Not found", { status: 404 });
      }

      const ct = request.headers.get("content-type") || "";
      if (!ct.includes("multipart/form-data")) {
        return new Response("Expected multipart/form-data", { status: 400 });
      }

      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return new Response("Missing file (field name: file)", { status: 400 });
      }
      if (!file.name.toLowerCase().endsWith(".epub")) {
        return new Response("Only .epub supported", { status: 400 });
      }

      const seriesTitle = String(form.get("seriesTitle") || "Standalone").trim();
      const bookTitle = String(form.get("bookTitle") || file.name.replace(/\.epub$/i, "")).trim();
      const author = String(form.get("author") || "Unknown").trim();

      const seriesId = slugify(seriesTitle);
      const bookId = slugify(bookTitle);

      const epubBytes = new Uint8Array(await file.arrayBuffer());
      const unzipped = unzipSync(epubBytes);

      function findOpfPath(files: Record<string, Uint8Array>): string {
        const container = Object.keys(files).find(p =>
          p.toLowerCase().endsWith("meta-inf/container.xml")
        );
        if (!container) throw new Error("container.xml not found");

        const xml = strFromU8(files[container]);
        const match = xml.match(/full-path="([^"]+)"/i);
        if (!match) throw new Error("OPF path not found in container.xml");

        return match[1];
      }

      function getAttr(tag: string, name: string): string | null {
        const re = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i");
        const m = tag.match(re);
        return m ? m[1] : null;
      }
      
      function normalizePath(baseDir: string, href: string): string {
        // remove fragment
        const clean = href.split("#")[0];
      
        // join
        let full = baseDir + clean;
      
        // normalize /./ and /../
        const parts = full.split("/").filter(p => p.length > 0);
        const out: string[] = [];
        for (const p of parts) {
          if (p === ".") continue;
          if (p === "..") { out.pop(); continue; }
          out.push(p);
        }
        return out.join("/");
      }
      
      function extractSpineHtmlPaths(
        files: Record<string, Uint8Array>,
        opfPath: string
      ): string[] {
        const opfXml = strFromU8(files[opfPath]);
      
        // base dir for relative hrefs
        const baseDir = opfPath.includes("/")
          ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
          : "";
      
        // manifest: id -> href
        const manifestMap: Record<string, string> = {};
        const itemTags = opfXml.match(/<item\b[^>]*>/gi) || [];
        for (const tag of itemTags) {
          const id = getAttr(tag, "id");
          const href = getAttr(tag, "href");
          if (id && href) manifestMap[id] = href;
        }
      
        // spine: sequence of idrefs
        const spinePaths: string[] = [];
        const itemrefTags = opfXml.match(/<itemref\b[^>]*>/gi) || [];
        for (const tag of itemrefTags) {
          const idref = getAttr(tag, "idref");
          if (!idref) continue;
          const href = manifestMap[idref];
          if (!href) continue;
      
          const fullPath = normalizePath(baseDir, href);
      
          // keep only text-like docs
          if (!/\.(xhtml|html|htm)$/i.test(fullPath)) continue;
      
          // only if it actually exists in zip
          if (files[fullPath]) spinePaths.push(fullPath);
        }
      
        // fallback: if spine gave nothing, try heuristic
        if (spinePaths.length === 0) {
          const htmlPaths = Object.keys(files)
            .filter(p => /\.(xhtml|html|htm)$/i.test(p))
            .sort((a,b) => a.localeCompare(b));
          return htmlPaths;
        }
      
        return spinePaths;
      }

      const opfPath = findOpfPath(unzipped);
      const htmlPaths = extractSpineHtmlPaths(unzipped, opfPath);

      if (htmlPaths.length === 0) {
        throw new Error("Spine HTML files not found");
      }

      let combinedText = "";
      for (const p of htmlPaths) {
        const bin = unzipped[p];
        if (!bin) continue; // <- защита
        const html = strFromU8(bin);
        combinedText += "\n\n" + stripHtml(html);
      }
      combinedText = combinedText.trim();
      if (combinedText.length < 200) {
        return new Response("EPUB text too short after extraction", { status: 400 });
      }

      const chunks = chunkWords(combinedText, 1200).slice(0, 3);
      const lessons: any[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const n = i + 1;
        const lessonTitle = `${bookTitle} — Chapter 1 (Fragment ${n})`;
        const lesson = await callOpenAIForLesson(env, chunks[i], lessonTitle);
        lessons.push({ index: n, lesson });
      }

      const chapterManifestPath = `data/${seriesId}/${bookId}/ch1.json`;
      const lessonDir = `data/${seriesId}/${bookId}/ch1/lessons`;

      const ch1Manifest = {
        title: `${bookTitle} — Chapter 1`,
        lessons: lessons.map(x => ({
          id: `${bookId}_ch1_f${x.index}`,
          label: `Fragment ${x.index}`,
          file: `${lessonDir}/f${x.index}.json`
        }))
      };

      const bookJson = {
        id: bookId,
        title: bookTitle,
        author,
        series: seriesTitle,
        chapters: [
          { id: "ch1", title: "Chapter 1", manifest: chapterManifestPath }
        ]
      };

      const zipFiles: Record<string, Uint8Array> = {};
      zipFiles[`data/${seriesId}/${bookId}/book.json`] = strToU8(JSON.stringify(bookJson, null, 2));
      zipFiles[chapterManifestPath] = strToU8(JSON.stringify(ch1Manifest, null, 2));
      for (const x of lessons) {
        zipFiles[`${lessonDir}/f${x.index}.json`] = strToU8(JSON.stringify(x.lesson, null, 2));
      }

      const zipped = zipSync(zipFiles, { level: 6 });

      return new Response(zipped, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${seriesId}_${bookId}_import.zip"`
        }
      });
    } catch (e: any) {
      return new Response(`Importer error: ${e?.message || String(e)}`, { status: 500 });
    }
  }
};