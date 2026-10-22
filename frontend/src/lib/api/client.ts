// HTTP client for the FastAPI backend in /backend.
//
// Every service and queue call goes through apiFetch(), which turns the backend's error
// responses into an ApiError with a message that can be shown to the user as is.

import { ApiError } from '@/lib/api/gateway';

// Where the backend runs. Set EXPO_PUBLIC_API_URL in frontend/.env to override it, for example
// with your computer's network address when testing on a phone, where "localhost" is the phone.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/+$/, '');

type ErrorBody = {
  detail?: unknown;
  errors?: { field: string; message: string }[];
};

// "durationMinutes" -> "Duration minutes", for field-level validation messages.
function fieldLabel(field: string) {
  const words = field.replace(/([A-Z])/g, ' $1').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function errorMessage(status: number, body: ErrorBody | null) {
  const first = body?.errors?.[0];
  if (first) return first.field ? `${fieldLabel(first.field)}: ${first.message}` : first.message;
  if (typeof body?.detail === 'string') return body.detail;
  return `The server could not complete the request (${status}).`;
}

export async function apiFetch<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, `Can't reach the QueueSmart server at ${API_URL}. Is the backend running?`);
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, errorMessage(response.status, data));
  return data as T;
}
