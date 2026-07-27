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
