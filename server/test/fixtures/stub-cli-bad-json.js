process.stdin.resume();
process.stdin.on('end', () => {
  console.log('this is not json at all, sorry');
});
process.stdin.on('data', () => {});
