let tail = Promise.resolve();
export function enqueue(fn) {
  const run = tail.then(fn, fn);
  tail = run.catch(() => {});
  return run;
}
