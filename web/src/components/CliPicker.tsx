import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api";
import type { CliMeta } from "../types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";

export default function CliPicker(props: {
  cli: string;
  model: string;
  onChange: (cli: string, model: string) => void;
}) {
  const [metas, setMetas] = useState<CliMeta[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const cliId = useId();
  const modelId = useId();

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
    api<CliMeta[]>("/meta/clis")
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
    <div className="section__row cli-picker">
      <Field>
        <FieldLabel htmlFor={cliId}>CLI</FieldLabel>
        <Select
          value={props.cli || null}
          onValueChange={(value) => {
            const meta = metas.find((item) => item.name === value);
            if (meta) props.onChange(meta.name, meta.models[0]);
          }}
        >
          <SelectTrigger id={cliId} aria-label="CLI 선택">
            <SelectValue placeholder="CLI 선택">{current?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {metas.map((meta) => (
              <SelectItem key={meta.name} value={meta.name}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={modelId}>모델</FieldLabel>
        <Select
          value={props.model || null}
          onValueChange={(value) => value && props.onChange(props.cli, value)}
        >
          <SelectTrigger id={modelId} aria-label="모델 선택">
            <SelectValue placeholder="모델 선택">
              {props.model || undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {current?.models.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {err && <FieldError>CLI 목록을 불러오지 못했습니다: {err}</FieldError>}
    </div>
  );
}
