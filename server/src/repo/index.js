import { categoriesRepo } from './categories.js';
import { questionsRepo } from './questions.js';
import { sentencesRepo } from './sentences.js';
import { correctionsRepo } from './corrections.js';

export function createRepos(db) {
  return {
    categories: categoriesRepo(db),
    questions: questionsRepo(db),
    sentences: sentencesRepo(db),
    corrections: correctionsRepo(db),
    close: () => db.close(),
  };
}
