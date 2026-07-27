import { categoriesRepo } from './categories.js';
import { questionsRepo } from './questions.js';
import { sentencesRepo } from './sentences.js';
import { correctionsRepo } from './corrections.js';
import { settingsRepo } from './settings.js';

export function createRepos(db) {
  return {
    categories: categoriesRepo(db),
    questions: questionsRepo(db),
    sentences: sentencesRepo(db),
    corrections: correctionsRepo(db),
    settings: settingsRepo(db),
    close: () => db.close(),
  };
}
