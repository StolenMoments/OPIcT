let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const evaluation = input.includes('OPIc rater');
  const result = evaluation
    ? {
        summary_ko: '과제를 충실히 수행했습니다.',
        strengths_ko: ['일관된 시제'],
        improvements_ko: ['디테일 추가'],
        recommended_expressions: [{ text: 'clear my head', note_ko: '머리를 식히다' }],
        corrected_answer: 'I have been jogging every morning for two years.',
        correction_notes: [{ before: 'jogging', after: 'have been jogging', reason_ko: '기간을 나타내므로 현재완료진행형을 사용합니다.' }],
      }
    : {
        corrected: 'I have been jogging every morning for two years.',
        alternatives: [{ text: 'Jogging has been part of my morning routine.', note_ko: '경험 강조' }],
        explanation_ko: '현재완료진행형이 자연스럽습니다.',
      };
  console.log(JSON.stringify(result));
});
