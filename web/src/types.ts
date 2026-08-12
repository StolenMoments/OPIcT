export type CategoryType = 'survey' | 'roleplay';
export type Category = { id: number; type: CategoryType; name: string; sort_order: number };
export type Question = { id: number; category_id: number; text: string; note: string | null; created_at: string };
export type Sentence = { id: number; category_id: number; text_en: string; memo: string | null; source: 'manual' | 'correction'; created_at: string };
export type CliMeta = { name: string; label: string; models: string[] };
export type Correction = {
  id: number;
  input_text: string;
  cli: string;
  model: string;
  status: string;
  result_json: string | null;
  raw_output: string | null;
  error_message: string | null;
  created_at: string;
};
export type CorrectionResult = { corrected: string; alternatives: { text: string; note_ko: string }[]; explanation_ko: string };
export type CorrectionNote = { before: string; after: string; reason_ko: string };
export type Attempt = {
  id: number;
  question_id: number;
  question_text?: string;
  audio_path: string | null;
  input_mode: 'audio' | 'text';
  transcript: string | null;
  cli: string;
  model: string;
  status: string;
  result_json: string | null;
  raw_output: string | null;
  error_message: string | null;
  created_at: string;
};
export type EvalResult = {
  summary_ko: string;
  strengths_ko: string[];
  improvements_ko: string[];
  recommended_expressions: { text: string; note_ko: string }[];
  corrected_answer?: string;
  correction_notes?: CorrectionNote[];
};
export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export type TrainingArea = {
  passes: boolean;
  feedback_ko: string;
};

export type TrainingVerdict = {
  passes: boolean;
  areas: {
    meaning: TrainingArea;
    grammar: TrainingArea;
    naturalness: TrainingArea;
    focus: TrainingArea;
  };
  hint_ko?: string;
};

export type TrainingAnswer = {
  id: number;
  session_item_id: number;
  attempt_no: 1 | 2;
  answer_text: string;
  status: 'pending' | 'running' | 'done' | 'error';
  verdict?: TrainingVerdict;
  reference_en?: string;
  error_message: string | null;
  created_at: string;
};

export type TrainingItem = {
  id: number;
  sentence_id: number;
  position: number;
  status:
    | 'pending'
    | 'grading_first'
    | 'awaiting_revision'
    | 'first_error'
    | 'grading_revision'
    | 'revision_error'
    | 'completed';
  outcome: 'first_try_pass' | 'hint_pass' | 'review' | null;
  source_type: 'attempt' | 'correction';
  source_id: number;
  source_sentence: string;
  intent_ko: string;
  focus_ko: string;
  mastery_status: 'learning' | 'mastered';
  reference_en?: string;
  answers: TrainingAnswer[];
};

export type TrainingSession = {
  id: number;
  status: 'building' | 'ready' | 'in_progress' | 'completed' | 'empty' | 'error';
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  items: TrainingItem[];
  summary?: {
    first_try_pass: number;
    hint_pass: number;
    review: number;
  };
};
