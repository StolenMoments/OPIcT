const expressionItemSchema = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    note_ko: { type: 'string' },
  },
  required: ['text', 'note_ko'],
  additionalProperties: false,
};

export const correctionResultSchema = {
  type: 'object',
  properties: {
    corrected: { type: 'string' },
    alternatives: {
      type: 'array',
      items: expressionItemSchema,
    },
    explanation_ko: { type: 'string' },
  },
  required: ['corrected', 'alternatives', 'explanation_ko'],
  additionalProperties: false,
};

export const evaluationResultSchema = {
  type: 'object',
  properties: {
    summary_ko: { type: 'string' },
    strengths_ko: {
      type: 'array',
      items: { type: 'string' },
    },
    improvements_ko: {
      type: 'array',
      items: { type: 'string' },
    },
    recommended_expressions: {
      type: 'array',
      items: expressionItemSchema,
    },
    corrected_answer: { type: 'string' },
  },
  required: [
    'summary_ko',
    'strengths_ko',
    'improvements_ko',
    'recommended_expressions',
    'corrected_answer',
  ],
  additionalProperties: false,
};

export const outputSchemas = {
  correction: correctionResultSchema,
  evaluation: evaluationResultSchema,
};

// Short aliases keep the schema names convenient for callers that only need one result type.
export const correctionSchema = correctionResultSchema;
export const evaluationSchema = evaluationResultSchema;
