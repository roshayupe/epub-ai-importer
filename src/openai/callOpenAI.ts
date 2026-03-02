import type { Env } from "../types";
import { buildLessonRequestBody, Lang } from "./lessonPrompt";

/**
 * Send lesson generation request to OpenAI.
 */
export async function callOpenAIForLesson(
  env: Env,
  chunkText: string,
  lessonTitle: string,
  translationLang: Lang
) {
  const model = env.OPENAI_MODEL || "gpt-4.1-mini";

  const body = buildLessonRequestBody({
    model,
    lessonTitle,
    chunkText,
    translationLang
  });

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenAI error ${response.status}: ${errorText}`
    );
  }

  const data: any = await response.json();

  const outText =
    data.output_text ??
    data.output
      ?.flatMap((o: any) => o.content || [])
      ?.map((c: any) => c.text || "")
      ?.join("") ??
    null;

  if (!outText) {
    throw new Error("OpenAI returned no structured output");
  }

  return JSON.parse(outText);
}