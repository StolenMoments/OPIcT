export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData bodies (multipart uploads) must let the browser set its own
  // content-type header with the multipart boundary; forcing
  // application/json here would break the upload.
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: isFormData ? init?.headers : { 'content-type': 'application/json', ...init?.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? res.statusText);
  return body as T;
}
