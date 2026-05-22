const AUTH_PATHS = ["/login", "/change-password"];

function shouldRedirectOnUnauthorized(): boolean {
  if (typeof window === "undefined") return false;
  return !AUTH_PATHS.some((p) => window.location.pathname.includes(p));
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError
  ) {
    super(body.message);
    this.name = "HttpError";
  }
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (res.status === 401 && shouldRedirectOnUnauthorized()) {
    window.location.href = "/login";
  }

  return res;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);

  // 204 No Content and similar empty responses — don't try to parse JSON
  const hasBody =
    res.status !== 204 &&
    res.status !== 205 &&
    (res.headers.get("content-length") ?? "1") !== "0";

  const body = hasBody ? await res.json() : undefined;
  if (!res.ok) throw new HttpError(res.status, body as ApiError);
  return body as T;
}
