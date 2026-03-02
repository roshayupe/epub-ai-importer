export function uiHtml(workerOrigin: string) {
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
input,select,button{width:100%;padding:12px;margin:8px 0;border-radius:10px;border:1px solid #333;background:#121212;color:#eee}
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

  <select id="translationLang">
    <option value="ru" selected>RU — Translation</option>
    <option value="uk">UK — Translation</option>
    <option value="en">EN — Translation</option>
  </select>

  <input id="targetWords" placeholder="Words per fragment (default 1000)" type="number"/>

  <input id="startChapter" placeholder="Start chapter (default 1)" type="number"/>
  <input id="endChapter" placeholder="End chapter (optional)" type="number"/>

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
    fd.append("translationLang", document.getElementById("translationLang").value || "ru");
    fd.append("targetWords", document.getElementById("targetWords").value || "1000");
    fd.append("startChapter", document.getElementById("startChapter").value || "1");
    fd.append("endChapter", document.getElementById("endChapter").value || "");

    log("Generating selected chapters... please wait.");
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