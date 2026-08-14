let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  if (!input.includes('PERSONALIZED_SENTENCE_MATERIAL')) {
    console.log(JSON.stringify({ items: [] }));
    return;
  }

  const items = [];
  if (input.includes('변경 없음')) {
    items.push({
      source_type: 'correction',
      source_id: 1,
      source_sentence: 'Stable source.',
      intent_ko: '변경되지 않은 source',
      reference_en: 'A stable generated sentence.',
      focus_ko: '안정적인 결과',
    });
  }
  if (input.includes('변경됨')) {
    items.push({
      source_type: 'correction',
      source_id: 2,
      source_sentence: 'Changed source.',
      intent_ko: '변경된 source',
      reference_en: 'A regenerated sentence.',
      focus_ko: '변경된 결과',
    });
  }
  console.log(JSON.stringify({ items }));
});
