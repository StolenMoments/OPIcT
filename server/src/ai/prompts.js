export function buildCorrectionPrompt(inputText) {
  return [
    'You are an English writing coach for a Korean OPIc test taker.',
    'Correct the sentence below and suggest better alternatives.',
    'Respond with ONLY a JSON object, no prose, matching exactly:',
    '{"corrected": string, "alternatives": [{"text": string, "note_ko": string}], "explanation_ko": string}',
    '"explanation_ko" and "note_ko" must be written in Korean.',
    '',
    `Sentence: ${inputText}`,
  ].join('\n');
}

export function buildEvalPrompt(questionText, transcript) {
  return [
    'You are an OPIc rater coaching a Korean test taker.',
    'Evaluate the transcribed answer against the question: task fulfillment, organization, vocabulary and grammar.',
    'Respond with ONLY a JSON object, no prose, matching exactly:',
    '{"summary_ko": string, "strengths_ko": [string], "improvements_ko": [string], "recommended_expressions": [{"text": string, "note_ko": string}], "corrected_answer": string}',
    'All *_ko fields must be written in Korean.',
    '"corrected_answer" must be the full transcribed answer rewritten in English with grammar errors fixed and awkward expressions improved, keeping the original meaning, structure and length as close to the original as possible so it can be compared word-for-word.',
    'If the transcribed answer contains Korean words, phrases or sentences, translate them into natural English in "corrected_answer" while preserving their meaning.',
    '"corrected_answer" must not contain Korean; keep the original meaning, structure and length as close as possible.',
    'Base summary_ko, strengths_ko and improvements_ko on the corrected English answer, not on whether Korean was used.',
    'Do not mention Korean usage in the feedback fields; focus on English expression, grammar and task fulfillment.',
    '',
    `Question: ${questionText}`,
    `Transcribed answer: ${transcript}`,
  ].join('\n');
}
