import { useEffect, useState } from 'react';
import { api } from '../api';
import type { CliMeta } from '../types';

export default function CliPicker(props: { cli: string; model: string; onChange: (cli: string, model: string) => void }) {
  const [metas, setMetas] = useState<CliMeta[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<CliMeta[]>('/meta/clis').then((m) => {
      setMetas(m);
      setErr(null);
      if (!props.cli && m.length) props.onChange(m[0].name, m[0].models[0]);
    }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const current = metas.find((m) => m.name === props.cli);
  return (
    <span style={{ display: 'inline-flex', gap: 8 }}>
      <select value={props.cli} onChange={(e) => {
        const m = metas.find((x) => x.name === e.target.value)!;
        props.onChange(m.name, m.models[0]);
      }}>
        {metas.map((m) => <option key={m.name} value={m.name}>{m.label}</option>)}
      </select>
      <select value={props.model} onChange={(e) => props.onChange(props.cli, e.target.value)}>
        {current?.models.map((mo) => <option key={mo} value={mo}>{mo}</option>)}
      </select>
      {err && <small style={{ color: 'crimson' }}> {err}</small>}
    </span>
  );
}
