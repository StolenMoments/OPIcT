process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({
    corrected: 'I have been jogging every morning for two years.',
    alternatives: [{ text: 'Jogging has been part of my morning routine.', note_ko: '경험 강조' }],
    explanation_ko: '현재완료진행형이 자연스럽습니다.',
    summary_ko: '과제를 충실히 수행했습니다.',
    strengths_ko: ['일관된 시제'],
    improvements_ko: ['디테일 추가'],
    recommended_expressions: [{ text: 'clear my head', note_ko: '머리를 식히다' }],
  }));
});
process.stdin.on('data', () => {});
