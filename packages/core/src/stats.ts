import type { Quiz } from "./types.js";
import type { QuestionResult } from "./evaluate.js";

export interface CategoryStat {
  /** Declared/free-form category id, or `null` for the uncategorized bucket. */
  categoryId: string | null;
  /** Human label from the categories registry, when available. */
  label?: string;
  total: number;
  answered: number;
  correct: number;
  incorrect: number;
  score: number;
  maxScore: number;
  /** correct / total (0 when the bucket is empty). */
  accuracy: number;
}

export interface OverallStat {
  total: number;
  answered: number;
  correct: number;
  incorrect: number;
  score: number;
  maxScore: number;
  accuracy: number;
}

export interface QuizStats {
  overall: OverallStat;
  /** Declared categories first (in declaration order), then any free-form, uncategorized last. */
  byCategory: CategoryStat[];
}

/** Aggregate per-question results into overall and per-category statistics. */
export function computeStats(quiz: Quiz, results: QuestionResult[]): QuizStats {
  const labels = new Map<string, string>();
  for (const category of quiz.categories ?? []) labels.set(category.id, category.label);

  const buckets = new Map<string | null, CategoryStat>();
  const bucketFor = (key: string | null): CategoryStat => {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        categoryId: key,
        label: key !== null ? labels.get(key) : undefined,
        total: 0,
        answered: 0,
        correct: 0,
        incorrect: 0,
        score: 0,
        maxScore: 0,
        accuracy: 0,
      };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  const overall: OverallStat = {
    total: 0,
    answered: 0,
    correct: 0,
    incorrect: 0,
    score: 0,
    maxScore: 0,
    accuracy: 0,
  };

  for (const result of results) {
    const bucket = bucketFor(result.category ?? null);
    bucket.total++;
    overall.total++;
    if (result.answered) {
      bucket.answered++;
      overall.answered++;
    }
    if (result.correct) {
      bucket.correct++;
      overall.correct++;
    } else {
      bucket.incorrect++;
      overall.incorrect++;
    }
    bucket.score += result.score;
    overall.score += result.score;
    bucket.maxScore += result.maxScore;
    overall.maxScore += result.maxScore;
  }

  for (const bucket of buckets.values()) {
    bucket.accuracy = bucket.total > 0 ? bucket.correct / bucket.total : 0;
  }
  overall.accuracy = overall.total > 0 ? overall.correct / overall.total : 0;

  const byCategory: CategoryStat[] = [];
  // Declared categories first, in declaration order.
  for (const category of quiz.categories ?? []) {
    const bucket = buckets.get(category.id);
    if (bucket) {
      byCategory.push(bucket);
      buckets.delete(category.id);
    }
  }
  // Any remaining free-form (non-null) categories.
  for (const [key, bucket] of buckets) {
    if (key !== null) byCategory.push(bucket);
  }
  // Uncategorized bucket last.
  const uncategorized = buckets.get(null);
  if (uncategorized) byCategory.push(uncategorized);

  return { overall, byCategory };
}
