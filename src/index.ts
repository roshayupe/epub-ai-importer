
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
    input:
      "Return ONLY valid JSON with title and words array.\n\n" +
      `LESSON TITLE: ${lessonTitle}\n\nTEXT:\n${chunkText}`
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

function uiHtml(workerOrigin: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
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
  <div class="small">Generates lesson ZIP from EPUB.</div>
  <input id="seriesTitle" placeholder="Series"/>
  <input id="bookTitle" placeholder="Book title"/>
  <input id="author" placeholder="Author"/>
  <input id="targetWords" placeholder="Words per fragment (default 1200)" type="number"/>
  <input id="maxFragments" placeholder="Max fragments (default 3)" type="number"/>
  <input id="startFrom" placeholder="Start from fragment (default 1)" type="number"/>
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
    fd.append("targetWords", document.getElementById("targetWords").value || "1200");
    fd.append("maxFragments", document.getElementById("maxFragments").value || "3");
    fd.append("startFrom", document.getElementById("startFrom").value || "1");

    log("Generating... please wait.");
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
      const startFrom = Math.max(1, Number(form.get("startFrom") || 1));

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

      const allChunks = chunkWords(combinedText, targetWords);
      const chunks = allChunks.slice(startFrom - 1, startFrom - 1 + maxFragments);

      const lessons: any[] = [];
      let partialError: any = null;

      for (let i = 0; i < chunks.length; i++) {
        const fragmentIndex = startFrom + i;

        try {
            const lessonTitle = `${bookTitle} — Fragment ${fragmentIndex}`;
            const lesson = await callOpenAIForLesson(env, chunks[i], lessonTitle);

            lessons.push({ index: fragmentIndex, lesson });
        } catch (e) {
            partialError = { fragment: fragmentIndex, error: String(e) };
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
