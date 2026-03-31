export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1";

export async function apiRequest(path, options = {}) {
  const { method = "GET", body, signal } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const message =
      payload?.error?.message || payload?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (payload?.success === false) {
    throw new Error(payload?.error?.message || "Request was not successful");
  }

  return payload?.data ?? payload;
}
