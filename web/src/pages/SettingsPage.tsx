import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import CategoryPicker from '../components/CategoryPicker';
import type { Category, CategoryType, Question } from '../types';

export default function SettingsPage() {
  // 카테고리 관리
  const [cats, setCats] = useState<Category[]>([]);
  const [newType, setNewType] = useState<CategoryType>('survey');
  const [newName, setNewName] = useState('');
  const loadCats = useCallback(() => api<Category[]>('/categories').then(setCats), []);
  useEffect(() => { loadCats(); }, [loadCats]);

  const addCat = async () => {
    if (!newName.trim()) return;
    await api('/categories', { method: 'POST', body: JSON.stringify({ type: newType, name: newName }) });
    setNewName(''); loadCats();
  };
  const renameCat = async (c: Category) => {
    const name = prompt('새 이름', c.name);
    if (!name) return;
    await api(`/categories/${c.id}`, { method: 'PUT', body: JSON.stringify({ name }) });
    loadCats();
  };
  const removeCat = async (c: Category) => {
    if (!confirm(`"${c.name}" 삭제? 문항·노트도 함께 삭제됩니다.`)) return;
    await api(`/categories/${c.id}`, { method: 'DELETE' });
    loadCats();
  };

  // 문항 관리
  const [catId, setCatId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQ, setNewQ] = useState('');
  const loadQs = useCallback(() => {
    if (catId) api<Question[]>(`/questions?category_id=${catId}`).then(setQuestions);
  }, [catId]);
  useEffect(() => { loadQs(); }, [loadQs]);

  const addQ = async () => {
    if (!catId || !newQ.trim()) return;
    await api('/questions', { method: 'POST', body: JSON.stringify({ category_id: catId, text: newQ }) });
    setNewQ(''); loadQs();
  };
  const editQ = async (q: Question) => {
    const text = prompt('문항 수정', q.text);
    if (!text) return;
    await api(`/questions/${q.id}`, { method: 'PUT', body: JSON.stringify({ text }) });
    loadQs();
  };
  const removeQ = async (q: Question) => {
    if (!confirm('문항 삭제?')) return;
    await api(`/questions/${q.id}`, { method: 'DELETE' });
    loadQs();
  };

  return (
    <div>
      <h2>카테고리 관리</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={newType} onChange={(e) => setNewType(e.target.value as CategoryType)}>
          <option value="survey">서베이</option>
          <option value="roleplay">롤플레잉</option>
        </select>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="예: 국내여행" />
        <button onClick={addCat}>추가</button>
      </div>
      <ul>
        {cats.map((c) => (
          <li key={c.id}>
            [{c.type === 'survey' ? '서베이' : '롤플레잉'}] {c.name}{' '}
            <button onClick={() => renameCat(c)}>수정</button>{' '}
            <button onClick={() => removeCat(c)}>삭제</button>
          </li>
        ))}
      </ul>

      <h2>문항 관리</h2>
      <CategoryPicker value={catId} onChange={setCatId} />
      {catId && (
        <>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <textarea value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="문항 영어 텍스트" rows={2} style={{ flex: 1 }} />
            <button onClick={addQ}>추가</button>
          </div>
          <ul>
            {questions.map((q) => (
              <li key={q.id}>
                {q.text}{' '}
                <button onClick={() => editQ(q)}>수정</button>{' '}
                <button onClick={() => removeQ(q)}>삭제</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
