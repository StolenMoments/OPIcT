process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({
    corrected: 'I have been jogging every morning for two years.',
    alternatives: [{ text: 'Jogging has been part of my morning routine for two years.', note_ko: '경험 강조' }],
    explanation_ko: '현재완료진행형이 자연스럽습니다.',
  }));
});
process.stdin.on('data', () => {});
