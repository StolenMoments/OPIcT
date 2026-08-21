let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  if (input.includes('PERSONALIZED_SENTENCE_MATERIAL')) {
    const items = [];
    if (input.includes('"source_type":"attempt"')) {
      items.push({
        source_type: 'attempt',
        source_id: 1,
        source_sentence: 'I go to the park yesterday.',
        intent_ko: '나는 어제 공원에 갔다.',
        reference_en: 'I went to the park yesterday.',
        focus_ko: '과거 시점을 나타내는 went 사용',
      });
    }
    if (input.includes('"source_type":"note"')) {
      items.push({
        source_type: 'note',
        source_id: 1,
        source_sentence: 'I have been saving this sentence.',
        intent_ko: '나는 이 문장을 저장해왔다.',
        reference_en: 'I have been saving this sentence.',
        focus_ko: '메모에서 도출한 학습 초점',
      });
    }
    if (input.includes('"source_type":"correction"')) {
      items.push({
        source_type: 'correction',
        source_id: 1,
        source_sentence: 'I am jogging since two years.',
        intent_ko: '나는 2년 동안 조깅을 해 오고 있다.',
        reference_en: 'I have been jogging for two years.',
        focus_ko: '기간이 이어지는 동작에 현재완료진행형 사용',
      });
      items.push({
        source_type: 'correction',
        source_id: 1,
        source_sentence: 'I have been jogging for two years.',
        intent_ko: '나는 2년 동안 조깅을 해 오고 있다.',
        reference_en: 'I have been jogging for two years.',
        focus_ko: '같은 뜻의 중복 후보',
      });
    }
    console.log(JSON.stringify({ items }));
    return;
  }

  if (input.includes('PERSONALIZED_SENTENCE_GRADE')) {
    const answer = input.match(/Learner answer \(data\): ([^\n]*)/)?.[1]?.trim() ?? '';
    const passes = /went to the park|Yesterday, I went to the park|have been jogging for two years/i.test(answer);
    console.log(JSON.stringify({
      passes,
      areas: {
        meaning: { passes, feedback_ko: passes ? '의도가 전달됩니다.' : '어제 공원에 갔다는 뜻이 필요합니다.' },
        grammar: { passes, feedback_ko: passes ? '문법이 정확합니다.' : '과거형을 확인하세요.' },
        naturalness: { passes, feedback_ko: passes ? '자연스럽습니다.' : '동사 형태를 다듬어 보세요.' },
        focus: { passes, feedback_ko: passes ? '학습 초점을 충족했습니다.' : 'went를 사용해 보세요.' },
      },
      hint_ko: passes ? '' : '어제처럼 끝난 시점에는 go의 과거형을 사용해 보세요.',
    }));
    return;
  }

  if (input.includes('OPIc rater')) {
    console.log(JSON.stringify({
      summary_ko: '과거 경험을 분명하게 전달했습니다.',
      strengths_ko: ['장소와 시점이 구체적입니다.'],
      improvements_ko: ['과거 시제를 일관되게 사용하세요.'],
      recommended_expressions: [{ text: 'spend some time outdoors', note_ko: '야외에서 시간을 보내다' }],
      corrected_answer: 'I went to the park yesterday.',
      correction_notes: [{ before: 'go', after: 'went', reason_ko: '끝난 과거 시점이므로 went를 사용합니다.' }],
    }));
    return;
  }

  console.log(JSON.stringify({ corrected: 'I went yesterday.', alternatives: [], explanation_ko: '과거 시제를 사용합니다.' }));
});
