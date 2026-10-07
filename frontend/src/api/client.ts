export type ApiErrorDetail = Record<string, unknown>;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: ApiErrorDetail[],
  ) {
    super(message);
  }
}

type Options = {
  method?: string;
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  /** Background polling: tells the server not to treat this as user activity. */
  poll?: boolean;
};

const BASE = "/api/v1";

export async function api<T = void>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (opts.poll) headers["X-Poll"] = "1";

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "network_error", "Connection lost.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.code ?? "error", err?.message ?? res.statusText, err?.details);
  }
  return data as T;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}
