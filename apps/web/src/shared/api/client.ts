import { ApiError } from "./api-error";

const apiUrl = (
  import.meta.env.VITE_API_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

type ApiClientOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

type ErrorEnvelope = {
  code: string;
  message: string;
  requestId?: string;
};

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    (candidate.requestId === undefined ||
      typeof candidate.requestId === "string")
  );
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function apiClient<T>(
  path: string,
  { body, headers, ...options }: ApiClientOptions = {},
): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;

  const payload = await parseJson(response);

  if (!response.ok) {
    const fallbackRequestId = response.headers.get("x-request-id") ?? undefined;

    if (isErrorEnvelope(payload)) {
      throw new ApiError({ status: response.status, ...payload });
    }

    throw new ApiError({
      status: response.status,
      code: "HTTP_ERROR",
      message: response.statusText || "The request could not be completed",
      requestId: fallbackRequestId,
    });
  }

  return payload as T;
}
