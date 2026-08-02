type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T;
};

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
};

const configuredBackend = import.meta.env.VITE_BACKEND_URL as string | undefined;
export const backendUrl = configuredBackend?.replace(/\/$/, "") || "";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${backendUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  let result: ApiEnvelope<T> | null = null;
  try {
    result = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError("The backend returned an unreadable response.", response.status);
  }

  if (!response.ok) {
    throw new ApiError(result.message || "Request failed.", response.status);
  }

  return result.data;
}
