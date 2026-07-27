import { categoriesRepo } from './categories.js';
import { questionsRepo } from './questions.js';

export function createRepos(db) {
  return {
    categories: categoriesRepo(db),
    questions: questionsRepo(db),
    close: () => db.close(),
  };
}
