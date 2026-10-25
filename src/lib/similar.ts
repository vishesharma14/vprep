import type { AttemptStatus, EmbeddingStatus } from '../types'

/** Similar questions are offered after a wrong answer, or after looking at the answer. */
export const offersSimilar = (status: AttemptStatus) => status === 'incorrect' || status === 'revealed'

/** At this similarity, as shown, or above, a question may be a duplicate. */
export const DUPLICATE_PERCENT = 90

/** A cosine similarity as a whole percent, 0–100. */
export function similarityPercent(similarity: number) {
  return Math.min(100, Math.max(0, Math.round(similarity * 100)))
}

/** True from DUPLICATE_PERCENT up, judged on the percent shown so the label and the number agree. */
export const isPossibleDuplicate = (similarity: number) => similarityPercent(similarity) >= DUPLICATE_PERCENT

/** Embeds new and changed questions: run from the project folder with ml/.venv active (see ml/README.md). */
export const EMBED_COMMAND = 'python ml/embed_questions.py'

/** How much of the bank has an embedding made from its current text. */
export function embeddingCoverage({ questions, embedded, missing, stale }: EmbeddingStatus) {
  const upToDate = embedded - stale
  return {
    upToDate,
    /** Null with no questions. */
    percent: questions > 0 ? Math.round((upToDate / questions) * 100) : null,
    /** Some are missing or stale: the embedding script needs running. */
    needsRun: missing > 0 || stale > 0,
  }
}
