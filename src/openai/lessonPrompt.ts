export type Lang = "ru" | "uk" | "en";

/**
 * Build OpenAI request body for lesson generation.
 */
export function buildLessonRequestBody(params: {
  model: string;
  lessonTitle: string;
  chunkText: string;
  translationLang: Lang;
}) {
  const { model, lessonTitle, chunkText, translationLang } = params;

  const translationsSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      [translationLang]: { type: "string" }
    },
    required: [translationLang]
  };

  const prompt =
    "You are a vocabulary analyst for advanced English learners.\n\n" +

    "Your task is to extract a REPRESENTATIVE lexical profile of the text fragment.\n" +
    "Do NOT randomly select words.\n\n" +

    "SELECTION PRIORITIES (in order):\n" +
    "1. Advanced vocabulary (C1, C2).\n" +
    "2. Upper-intermediate vocabulary (B2, B2+).\n" +
    "3. Important narrative verbs and descriptive adjectives.\n" +
    "4. Meaningful multi-word expressions and collocations.\n" +
    "5. Words central to the fragment.\n\n" +

    "Avoid:\n" +
    "- Very basic A1/A2 words unless contextually significant.\n" +
    "- Function words.\n" +
    "- Proper names unless lexically important.\n\n" +

    "Select 25–40 entries total.\n" +
    "Ensure at least 40% are B2 or above.\n" +
    "Use British IPA.\n" +
    "Levels must be one of: A2, B1, B1+, B2, B2+, C1, C2.\n\n" +

    `Provide translation ONLY in ${translationLang.toUpperCase()}.\n` +
    `Put translation inside translations.${translationLang}.\n` +
    "Do NOT output a field named 'translation'.\n\n" +

    `LESSON TITLE: ${lessonTitle}\n\nTEXT:\n${chunkText}`;

  return {
    model,
    input: prompt,
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
                  translations: translationsSchema,
                  definition: { type: "string" },
                  example: { type: "string" },
                  exampleText: { type: "string" }
                },
                required: [
                  "word",
                  "ipa",
                  "type",
                  "level",
                  "translations",
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
}