process.stdin.resume();
process.stdin.on('end', () => {
  console.log('partial output before failure');
  process.exitCode = 1;
});
process.stdin.on('data', () => {});
