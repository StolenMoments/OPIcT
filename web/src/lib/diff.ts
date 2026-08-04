export type DiffToken = { type: 'equal' | 'delete' | 'insert'; text: string };

function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

// Word-level LCS diff. Sentence-length inputs only (O(n*m)); not meant for large documents.
export function diffWords(before: string, after: string): DiffToken[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      tokens.push({ type: 'equal', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      tokens.push({ type: 'delete', text: a[i] });
      i++;
    } else {
      tokens.push({ type: 'insert', text: b[j] });
      j++;
    }
  }
  while (i < n) tokens.push({ type: 'delete', text: a[i++] });
  while (j < m) tokens.push({ type: 'insert', text: b[j++] });

  return mergeAdjacent(tokens);
}

function mergeAdjacent(tokens: DiffToken[]): DiffToken[] {
  const merged: DiffToken[] = [];
  for (const t of tokens) {
    const last = merged[merged.length - 1];
    if (last && last.type === t.type) {
      last.text += t.text;
    } else {
      merged.push({ ...t });
    }
  }
  return merged;
}
