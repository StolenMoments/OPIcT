let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const verifying = input.includes('Validate and, if needed, correct the candidate result below.');
  console.log(JSON.stringify({
    corrected: verifying ? 'I have been jogging every morning for two years.' : 'I am jogging since two years.',
    alternatives: [{ text: 'Jogging has been part of my morning routine.', note_ko: '경험 강조' }],
    explanation_ko: verifying ? '현재완료진행형으로 수정했습니다.' : '초안 설명',
    summary_ko: verifying ? '검증된 평가입니다.' : '초안 평가',
    strengths_ko: ['일관된 시제'],
    improvements_ko: ['디테일 추가'],
    recommended_expressions: [{ text: 'clear my head', note_ko: '머리를 식히다' }],
    corrected_answer: verifying ? 'I have been jogging every morning for two years.' : 'I am jogging since two years.',
  }));
});
