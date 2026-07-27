export function lenientJson(text) {
  if (typeof text !== 'string') return null;
  const candidates = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1]);
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const v = JSON.parse(c.trim());
      if (v && typeof v === 'object') return v;
    } catch { /* 다음 후보 */ }
  }
  return null;
}
