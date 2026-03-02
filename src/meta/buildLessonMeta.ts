import {
  computeDistribution,
  computeScore,
  scoreToLevel,
  LevelDistribution
} from "../stats/scoring";

/**
 * Basic word entry structure expected from OpenAI.
 */
export interface WordEntry {
  word: string;
  ipa: string;
  type: string;
  level: string;
  translations: Record<string, string>;
  definition: string;
  example: string;
  exampleText: string;
}

/**
 * Build structured lesson with meta and stats.
 */
export function buildLessonWithMeta(params: {
  lessonTitle: string;
  bookId: string;
  bookTitle: string;
  author: string;
  chapterIndex: number;
  chapterTitle: string;
  sourceFile: string;
  fragmentIndexInChapter: number;
  totalFragmentsInChapter: number;
  sourceText: string;
  words: WordEntry[];
}) {
  const {
    lessonTitle,
    bookId,
    bookTitle,
    author,
    chapterIndex,
    chapterTitle,
    sourceFile,
    fragmentIndexInChapter,
    totalFragmentsInChapter,
    sourceText,
    words
  } = params;

  // Compute CEFR distribution
  const levelDistribution: LevelDistribution =
    computeDistribution(words);

  // Compute weighted difficulty score
  const score = computeScore(levelDistribution);

  const derivedLevel = scoreToLevel(score);

  // Compute additional statistics
  const wordCount = countWords(sourceText);
  const paragraphCount = countParagraphs(sourceText);
  const uniqueWordCount = countUniqueWords(sourceText);

  return {
    title: lessonTitle,

    sourceText,

    meta: {
      book: {
        id: bookId,
        title: bookTitle,
        author
      },

      chapter: {
        index: chapterIndex,
        title: chapterTitle,
        sourceFile
      },

      fragment: {
        indexInChapter: fragmentIndexInChapter,
        totalInChapter: totalFragmentsInChapter
      },

      stats: {
        wordCount,
        uniqueWordCount,
        paragraphCount,
        levelDistribution,
        score,
        level: derivedLevel,
        generatedAt: new Date().toISOString()
      }
    },

    words
  };
}

/* =========================
   Helper functions
========================= */

/**
 * Count words in text.
 */
function countWords(text: string): number {
  return text
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Count paragraphs in text.
 */
function countParagraphs(text: string): number {
  return text
    .split(/\n\s*\n/)
    .filter(Boolean).length;
}

/**
 * Estimate unique word count (simple normalization).
 */
function countUniqueWords(text: string): number {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s']/g, "")
    .split(/\s+/)
    .filter(Boolean);

  const unique = new Set(words);
  return unique.size;
}