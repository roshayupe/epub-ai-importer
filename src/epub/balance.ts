/**
 * Split chapter text into balanced fragments.
 * Paragraph boundaries are preserved.
 */
export function splitChapterBalanced(
  chapterText: string,
  targetWords = 1000
): string[] {
  const paragraphs = splitIntoParagraphs(chapterText);
  const totalWords = countWords(chapterText);

  // If chapter is smaller than target size, return as single fragment
  if (totalWords <= targetWords) {
    return [chapterText.trim()];
  }

  // Determine required number of fragments
  const fragmentCount = Math.ceil(totalWords / targetWords);

  const fragments: string[] = [];

  let currentParagraphs: string[] = [];
  let currentWords = 0;
  let wordsAssigned = 0;
  let remainingFragments = fragmentCount;

  for (const paragraph of paragraphs) {
    const paragraphWordCount = countWords(paragraph);
    const remainingWords = totalWords - wordsAssigned;

    // Dynamically recalculate ideal size for remaining fragments
    const dynamicIdeal =
      remainingWords / remainingFragments;

    // Close current fragment if it reached ideal size
    if (
      currentWords >= dynamicIdeal &&
      remainingFragments > 1
    ) {
      fragments.push(
        currentParagraphs.join("\n\n").trim()
      );

      currentParagraphs = [];
      currentWords = 0;
      remainingFragments--;
    }

    currentParagraphs.push(paragraph);
    currentWords += paragraphWordCount;
    wordsAssigned += paragraphWordCount;
  }

  // Push final fragment
  if (currentParagraphs.length > 0) {
    fragments.push(
      currentParagraphs.join("\n\n").trim()
    );
  }

  return fragments;
}

/**
 * Split text into paragraphs using blank lines.
 */
function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);
}

/**
 * Count words in text.
 */
function countWords(text: string): number {
  return text
    .split(/\s+/)
    .filter(Boolean).length;
}