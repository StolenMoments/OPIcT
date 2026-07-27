import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { CliMeta } from '../types';
import './ui/Field.css';

export default function CliPicker(props: { cli: string; model: string; onChange: (cli: string, model: string) => void }) {
  const [metas, setMetas] = useState<CliMeta[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // `props.cli` can change after mount (e.g. a sibling effect on the parent page
  // loads a saved default asynchronously). The /meta/clis fetch below and that
  // sibling effect race with no ordering guarantee, so the auto-select callback
  // must read the *live* cli value at the moment the response lands, not the
  // value captured by its mount-time closure — otherwise a default that
  // resolves first can be silently clobbered by the "pick the first CLI"
  // fallback. A ref mirrors the prop on every render for exactly that purpose.
  const cliRef = useRef(props.cli);
  cliRef.current = props.cli;
  const autoSelectedRef = useRef(false);

  useEffect(() => {
    api<CliMeta[]>('/meta/clis')
      .then((m) => {
        setMetas(m);
        setErr(null);
        if (!autoSelectedRef.current && !cliRef.current && m.length) {
          autoSelectedRef.current = true;
          props.onChange(m[0].name, m[0].models[0]);
        }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = metas.find((m) => m.name === props.cli);

  return (
    <div className="section__row">
      <select
        className="select"
        aria-label="CLI 선택"
        value={props.cli}
        onChange={(e) => {
          const m = metas.find((x) => x.name === e.target.value)!;
          props.onChange(m.name, m.models[0]);
        }}
      >
        {metas.map((m) => (
          <option key={m.name} value={m.name}>
            {m.label}
          </option>
        ))}
      </select>
      <select
        className="select"
        aria-label="모델 선택"
        value={props.model}
        onChange={(e) => props.onChange(props.cli, e.target.value)}
      >
        {current?.models.map((mo) => (
          <option key={mo} value={mo}>
            {mo}
          </option>
        ))}
      </select>
      {err && (
        <p className="field__error" role="alert">
          CLI 목록을 불러오지 못했습니다: {err}
        </p>
      )}
    </div>
  );
}
