export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiRequestInit extends RequestInit {
  timeoutMs?: number;
}

export async function apiFetch<T = unknown>(
  input: RequestInfo | URL,
  init: ApiRequestInit = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 15_000);
  const signal = init.signal ?? controller.signal;

  try {
    const response = await fetch(input, {
      ...init,
      credentials: "include",
      signal,
      cache: init.cache ?? "no-store",
      headers: {
        Accept: "application/json",
        ...init.headers,
      },
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload && typeof payload.error === "string"
          ? payload.error
          : `Request failed with status ${response.status}`;
      throw new ApiError(message, response.status, payload?.code);
    }

    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function isExpectedRequestError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return error instanceof TypeError && error.message === "Failed to fetch";
}
