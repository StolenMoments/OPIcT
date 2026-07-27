import { useEffect, useState } from 'react';

export function usePolling<T>(fetcher: () => Promise<T>, active: boolean, intervalMs = 2000): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const tick = async () => {
      try { const d = await fetcher(); if (!stopped) setData(d); } catch { /* 다음 틱에 재시도 */ }
    };
    tick();
    const t = setInterval(tick, intervalMs);
    return () => { stopped = true; clearInterval(t); };
  }, [active, intervalMs]); // fetcher는 최신 클로저 사용을 위해 의도적으로 deps 제외
  return data;
}
