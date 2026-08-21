const expressionItemSchema = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    note_ko: { type: 'string' },
  },
  required: ['text', 'note_ko'],
  additionalProperties: false,
};

export const correctionNoteSchema = {
  type: 'object',
  properties: {
    before: { type: 'string' },
    after: { type: 'string' },
    reason_ko: { type: 'string', minLength: 1 },
  },
  required: ['before', 'after', 'reason_ko'],
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
    correction_notes: {
      type: 'array',
      items: correctionNoteSchema,
    },
  },
  required: [
    'summary_ko',
    'strengths_ko',
    'improvements_ko',
    'recommended_expressions',
    'corrected_answer',
    'correction_notes',
  ],
  additionalProperties: false,
};

const trainingAreaSchema = {
  type: 'object',
  properties: {
    passes: { type: 'boolean' },
    feedback_ko: { type: 'string', minLength: 1 },
  },
  required: ['passes', 'feedback_ko'],
  additionalProperties: false,
};

export const trainingMaterialSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        properties: {
          source_type: { type: 'string', enum: ['attempt', 'correction', 'note'] },
          source_id: { type: 'integer', minimum: 1 },
          source_sentence: { type: 'string', minLength: 1 },
          intent_ko: { type: 'string', minLength: 1 },
          reference_en: { type: 'string', minLength: 1 },
          focus_ko: { type: 'string', minLength: 1 },
        },
        required: ['source_type', 'source_id', 'source_sentence', 'intent_ko', 'reference_en', 'focus_ko'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

export const trainingGradeSchema = {
  type: 'object',
  properties: {
    passes: { type: 'boolean' },
    areas: {
      type: 'object',
      properties: {
        meaning: trainingAreaSchema,
        grammar: trainingAreaSchema,
        naturalness: trainingAreaSchema,
        focus: trainingAreaSchema,
      },
      required: ['meaning', 'grammar', 'naturalness', 'focus'],
      additionalProperties: false,
    },
    hint_ko: { type: 'string' },
  },
  required: ['passes', 'areas', 'hint_ko'],
  additionalProperties: false,
};

export const trainingVariationSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          parent_id: { type: 'integer', minimum: 1 },
          variation_kind: { type: 'string', enum: ['tense', 'subject', 'negation', 'question'] },
          intent_ko: { type: 'string', minLength: 1 },
          reference_en: { type: 'string', minLength: 1 },
          focus_ko: { type: 'string', minLength: 1 },
        },
        required: ['parent_id', 'variation_kind', 'intent_ko', 'reference_en', 'focus_ko'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

export const outputSchemas = {
  correction: correctionResultSchema,
  evaluation: evaluationResultSchema,
  trainingMaterial: trainingMaterialSchema,
  trainingGrade: trainingGradeSchema,
  trainingVariation: trainingVariationSchema,
};

// Short aliases keep the schema names convenient for callers that only need one result type.
export const correctionSchema = correctionResultSchema;
export const evaluationSchema = evaluationResultSchema;
