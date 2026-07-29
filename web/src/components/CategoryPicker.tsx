import { useEffect, useId, useState } from "react";
import { api } from "../api";
import type { Category, CategoryType } from "../types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";

export default function CategoryPicker(props: {
  value: number | null;
  onChange: (id: number) => void;
  type?: CategoryType;
  refreshKey?: number;
}) {
  const [cats, setCats] = useState<Category[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const selectId = useId();

  useEffect(() => {
    api<Category[]>(`/categories${props.type ? `?type=${props.type}` : ""}`)
      .then((c) => {
        setCats(c);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [props.type, props.refreshKey]);

  const selected = cats.find((category) => category.id === props.value);
  const selectedLabel = selected
    ? `[${selected.type === "survey" ? "서베이" : "롤플레잉"}] ${selected.name}`
    : undefined;

  return (
    <Field className="category-picker" data-invalid={Boolean(err)}>
      <FieldLabel htmlFor={selectId}>카테고리</FieldLabel>
      <Select
        value={props.value == null ? null : String(props.value)}
        onValueChange={(value) => value && props.onChange(Number(value))}
      >
        <SelectTrigger id={selectId} aria-label="카테고리 선택">
          <SelectValue placeholder="카테고리 선택">{selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {cats.map((category) => (
            <SelectItem key={category.id} value={String(category.id)}>
              [{category.type === "survey" ? "서베이" : "롤플레잉"}]{" "}
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {err && <FieldError>카테고리를 불러오지 못했습니다: {err}</FieldError>}
    </Field>
  );
}
