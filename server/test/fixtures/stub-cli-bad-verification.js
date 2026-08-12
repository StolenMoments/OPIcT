let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  if (input.includes('Validate and, if needed, correct the candidate result below.')) {
    console.log('not valid JSON from verification');
    return;
  }
  const evaluation = input.includes('OPIc rater');
  console.log(JSON.stringify(evaluation
    ? {
        summary_ko: '초안',
        strengths_ko: [],
        improvements_ko: [],
        recommended_expressions: [],
        corrected_answer: 'I went yesterday.',
        correction_notes: [],
      }
    : {
        corrected: 'I went yesterday.',
        alternatives: [],
        explanation_ko: '초안',
      }));
});
