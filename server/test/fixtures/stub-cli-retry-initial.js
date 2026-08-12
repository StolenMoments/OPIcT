let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const repair = input.includes('The previous response failed JSON parsing');
  const verification = input.includes('Validate and, if needed, correct the candidate result below.');
  if (!repair && !verification) {
    console.log('not valid JSON on first output');
    return;
  }
  const evaluation = input.includes('OPIc rater') || input.includes('OPIc evaluation');
  console.log(JSON.stringify(evaluation
    ? {
        summary_ko: '재시도로 복구했습니다.', strengths_ko: [], improvements_ko: [],
        recommended_expressions: [], corrected_answer: 'I went yesterday.', correction_notes: [],
      }
    : {
        corrected: 'I went yesterday.', alternatives: [], explanation_ko: '재시도로 복구했습니다.',
      }));
});
