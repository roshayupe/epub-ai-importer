import type { Env } from "./types";

import { uiHtml } from "./ui/uiHtml";

import { unzipEpubFile } from "./epub/unzip";
import { extractChapters } from "./epub/chapters";
import { splitChapterBalanced } from "./epub/balance";
import { zipJsonFiles } from "./epub/zip";

import { callOpenAIForLesson } from "./openai/callOpenAI";
import { buildLessonWithMeta } from "./meta/buildLessonMeta";

import { slugify } from "./utils/slugify";
import { pickLang } from "./utils/lang";

/**
 * Cloudflare Worker entry point.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      /**
       * Serve UI on GET /
       */
      if (request.method === "GET" && url.pathname === "/") {
        return new Response(uiHtml(url.origin), {
          headers: {
            "Content-Type": "text/html; charset=utf-8"
          }
        });
      }

      /**
       * Handle EPUB import on POST /import
       */
      if (request.method === "POST" && url.pathname === "/import") {

        const form = await request.formData();
        const file = form.get("file");

        if (!(file instanceof File)) {
          return new Response("Missing file", { status: 400 });
        }

        const translationLang = pickLang(
          form.get("translationLang"),
          "ru"
        );

        const seriesTitle = String(
          form.get("seriesTitle") || "Standalone"
        );

        const bookTitle = String(
          form.get("bookTitle") ||
            file.name.replace(/\.epub$/i, "")
        );

        const author = String(
          form.get("author") || "Unknown"
        );

        const targetWords = Number(
          form.get("targetWords") || 1000
        );

        const startChapter = Math.max(
          1,
          Number(form.get("startChapter") || 1)
        );

        const endChapterRaw = form.get("endChapter");
        const endChapter = endChapterRaw
          ? Math.max(startChapter, Number(endChapterRaw))
          : undefined;

        const bookId = slugify(bookTitle);

        /**
         * 1️⃣ Unzip EPUB
         */
        const archive = await unzipEpubFile(file);

        /**
         * 2️⃣ Extract chapters
         */
        const chapters = extractChapters(archive);

        console.log("Total chapters detected:", chapters.length);

        console.log(
          "Chapter indices:",
          chapters.map(c => c.index)
        );

        console.log(
          "Chapter titles:",
          chapters.map(c => c.title)
        );

        const selectedChapters = chapters.filter(ch =>
          ch.index >= startChapter &&
          (endChapter ? ch.index <= endChapter : true)
        );

        if (selectedChapters.length === 0) {
          return new Response(
            "No chapters selected",
            { status: 400 }
          );
        }

        const outputFiles: Record<string, unknown> = {};

        /**
         * 3️⃣ Process selected chapters
         */
        for (const chapter of selectedChapters) {

          const fragments = splitChapterBalanced(
            chapter.text,
            targetWords
          );

          for (let i = 0; i < fragments.length; i++) {

            const fragmentText = fragments[i];

            const lessonTitle =
              `${bookTitle} — ${chapter.title} ` +
              `(Fragment ${i + 1})`;

            /**
             * 4️⃣ Call OpenAI for lexical profile
             */
            const lesson = await callOpenAIForLesson(
              env,
              fragmentText,
              lessonTitle,
              translationLang
            );

            /**
             * 5️⃣ Attach structured meta
             */
            const finalLesson = buildLessonWithMeta({
              lessonTitle,
              bookId,
              bookTitle,
              author,
              chapterIndex: chapter.index,
              chapterTitle: chapter.title,
              sourceFile: chapter.sourceFile,
              fragmentIndexInChapter: i + 1,
              totalFragmentsInChapter: fragments.length,
              sourceText: fragmentText,
              words: lesson.words
            });

            const fileName =
              `${bookId}_ch${chapter.index}_f${i + 1}.json`;

            outputFiles[fileName] = finalLesson;
          }
        }

        /**
         * 6️⃣ Zip results
         */
        const zipped = zipJsonFiles(outputFiles);

        return new Response(zipped, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition":
              `attachment; filename="${bookId}.zip"`
          }
        });
      }

      /**
       * Fallback for unknown routes
       */
      return new Response("Not found", { status: 404 });

    } catch (err: any) {
      return new Response(
        `Importer error: ${err?.message || err}`,
        { status: 500 }
      );
    }
  }
};