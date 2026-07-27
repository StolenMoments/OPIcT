export type CategoryType = 'survey' | 'roleplay';
export type Category = { id: number; type: CategoryType; name: string; sort_order: number };
export type Question = { id: number; category_id: number; text: string; note: string | null; created_at: string };
export type Sentence = { id: number; category_id: number; text_en: string; memo: string | null; source: 'manual' | 'correction'; created_at: string };
