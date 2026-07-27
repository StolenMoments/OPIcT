import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Category, CategoryType } from '../types';
import './ui/Field.css';

export default function CategoryPicker(props: {
  value: number | null;
  onChange: (id: number) => void;
  type?: CategoryType;
  refreshKey?: number;
}) {
  const [cats, setCats] = useState<Category[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Category[]>(`/categories${props.type ? `?type=${props.type}` : ''}`)
      .then((c) => {
        setCats(c);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [props.type, props.refreshKey]);

  return (
    <div className="field">
      <select
        className="select"
        aria-label="카테고리 선택"
        value={props.value ?? ''}
        onChange={(e) => props.onChange(Number(e.target.value))}
      >
        <option value="" disabled>
          카테고리 선택
        </option>
        {cats.map((c) => (
          <option key={c.id} value={c.id}>
            [{c.type === 'survey' ? '서베이' : '롤플레잉'}] {c.name}
          </option>
        ))}
      </select>
      {err && (
        <p className="field__error" role="alert">
          카테고리를 불러오지 못했습니다: {err}
        </p>
      )}
    </div>
  );
}
