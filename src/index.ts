
import { Hono } from "hono";
import type { Env } from "./types";
import { z } from "zod";
import {
  strToU8,
  uint8ArrayToBase64,
  zipSync,
  ZipOptions,
} from "fflate";

const app = new Hono<{ Bindings: Env }>();

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function callOpenAI(
  apiKey: string,
  input: any,
  model: string
): Promise<any> {
  return fetchWithTimeout(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input,
      }),
    },
    65000
  )
    .then((res) => {
      if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
      return res.json();
    });
}

const importSchema = z.object({
  seriesId: z.string(),
  bookId: z.string(),
  fragments: z.string().array(),
  targetWords: z.union([z.string(), z.number()]).optional(),
  maxFragments: z.union([z.string(), z.number()]).optional(),
  openaiModel: z.string().optional(),
});

app.post("/import", async (c) => {
  const body = await c.req.json();
  const parsed = importSchema.safeParse(body);

  if (!parsed.success)
    return c.json({ error: "Invalid input" }, 400);

  const {
    seriesId,
    bookId,
    fragments,
    openaiModel,
    targetWords,
    maxFragments,
  } = parsed.data;

  const model = openaiModel || "gpt-4.1";
  const tWords = Number(targetWords) || 1200;
  const mFrags = Math.max(1, Number(maxFragments) || 3);

  const allChunks = fragments;
  const chunks = allChunks.slice(0, mFrags);

  const zipFiles: Record<string, Uint8Array> = {};
  let processedCount = 0;
  let partialError: Record<string, any> | null = null;

  for (let i = 0; i < chunks.length; i++) {
    const frag = chunks[i];
    try {
      const response = await callOpenAI(
        c.env.OPENAI_API_KEY,
        {
          text: frag,
          max_output_tokens: tWords,
        },
        model
      );

      const lessonJson = {
        fragment: i + 1,
        totalChunks: allChunks.length,
        words: response.output_text || "",
        generatedAt: new Date().toISOString(),
      };

      const fname = `data/${seriesId}/${bookId}/lesson_${i + 1}.json`;
      zipFiles[fname] = strToU8(JSON.stringify(lessonJson, null, 2));

      processedCount++;
    } catch (err) {
      partialError = {
        message: String(err),
        fragment: i + 1,
      };
      break;
    }
  }

  if (partialError) {
    zipFiles[
      `data/${seriesId}/${bookId}/import_error.json`
    ] = strToU8(JSON.stringify(partialError, null, 2));
  }

  const zipBytes = zipSync(zipFiles, {
    level: 6,
  } as ZipOptions);

  const base64Zip = uint8ArrayToBase64(zipBytes);

  const statusCode = partialError ? 206 : 200;

  return c.json(
    {
      processed: processedCount,
      total: allChunks.length,
      status: partialError ? "partial" : "complete",
      zip: base64Zip,
    },
    statusCode
  );
});

export default app;
