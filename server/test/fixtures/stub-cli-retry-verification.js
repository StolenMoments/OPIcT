let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const verification = input.includes('Validate and, if needed, correct the candidate result below.');
  const repair = input.includes('The previous response failed JSON parsing');
  if (verification && !repair) {
    console.log('not valid JSON from verification');
    return;
  }
  const evaluation = input.includes('OPIc rater') || input.includes('OPIc evaluation');
  console.log(JSON.stringify(evaluation
    ? {
        summary_ko: repair ? '검증 재시도로 복구했습니다.' : '초안', strengths_ko: [], improvements_ko: [],
        recommended_expressions: [], corrected_answer: 'I went yesterday.', correction_notes: [],
      }
    : {
        corrected: 'I went yesterday.', alternatives: [], explanation_ko: repair ? '검증 재시도로 복구했습니다.' : '초안',
      }));
});
