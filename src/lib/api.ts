const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, init);
}
