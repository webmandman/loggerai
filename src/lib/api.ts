export function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, init);
}
