export class ApiError extends Error {
  status: number;
  code?: string;
  details: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData bodies (multipart uploads) must let the browser set its own
  // content-type header with the multipart boundary; forcing
  // application/json here would break the upload.
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const hasBody = init?.body != null;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: isFormData || !hasBody ? init?.headers : { 'content-type': 'application/json', ...init?.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const { error, code, ...details } = body && typeof body === 'object' ? body : {};
    throw new ApiError(error ?? res.statusText, res.status, code, details);
  }
  return body as T;
}
