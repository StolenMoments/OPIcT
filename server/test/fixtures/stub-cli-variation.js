let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  if (input.includes('PERSONALIZED_SENTENCE_VARIATION')) {
    const match = input.match(/Parent sentences \(data\):\s*(\[[^\n]*\])/);
    const parents = match ? JSON.parse(match[1]) : [];
    const items = [];
    parents.forEach((parent, index) => {
      items.push({
        parent_id: parent.parent_id,
        variation_kind: 'tense',
        intent_ko: `변형 의도 ${parent.parent_id}-1`,
        reference_en: `Variation sentence for parent ${parent.parent_id} A.`,
        focus_ko: '변형 초점 A',
      });
      items.push({
        parent_id: parent.parent_id,
        variation_kind: 'subject',
        intent_ko: `변형 의도 ${parent.parent_id}-2`,
        // The first parent's second and third items share a reference_en on
        // purpose, to exercise fingerprint dedupe within a single batch.
        reference_en: index === 0 ? 'Duplicate variation sentence.' : `Variation sentence for parent ${parent.parent_id} B.`,
        focus_ko: '변형 초점 B',
      });
      if (index === 0) {
        items.push({
          parent_id: parent.parent_id,
          variation_kind: 'negation',
          intent_ko: `변형 의도 ${parent.parent_id}-3`,
          reference_en: 'Duplicate variation sentence.',
          focus_ko: '변형 초점 C',
        });
      }
    });
    console.log(JSON.stringify({ items }));
    return;
  }
  console.log(JSON.stringify({ items: [] }));
});
