import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Category, CategoryType } from '../types';

export default function CategoryPicker(props: {
  value: number | null;
  onChange: (id: number) => void;
  type?: CategoryType;
  refreshKey?: number;
}) {
  const [cats, setCats] = useState<Category[]>([]);
  useEffect(() => {
    api<Category[]>(`/categories${props.type ? `?type=${props.type}` : ''}`)
      .then(setCats)
      .catch(() => {});
  }, [props.type, props.refreshKey]);
  return (
    <select value={props.value ?? ''} onChange={(e) => props.onChange(Number(e.target.value))}>
      <option value="" disabled>카테고리 선택</option>
      {cats.map((c) => (
        <option key={c.id} value={c.id}>[{c.type === 'survey' ? '서베이' : '롤플레잉'}] {c.name}</option>
      ))}
    </select>
  );
}
