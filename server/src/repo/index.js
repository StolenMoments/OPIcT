export function createRepos(db) {
  return {
    close: () => db.close(),
  };
}
