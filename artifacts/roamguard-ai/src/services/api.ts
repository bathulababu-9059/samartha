const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api"
).replace(/\/+$/, "");

async function apiRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${text.slice(0, 300)}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Backend returned an invalid JSON response.");
  }
}

export const searchLocations = (query: string) =>
  apiRequest<unknown>(`/locations/search?q=${encodeURIComponent(query)}`);

export const parseTrip = (query: string, language: "en" | "te" = "en") =>
  apiRequest<unknown>("/trips/parse", { query, language });

export const planTrip = (payload: unknown) =>
  apiRequest<unknown>("/trips/plan", payload);
