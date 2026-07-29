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
};
