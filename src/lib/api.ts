import type { DailyQuote, Homework, HomeworkPayload, ViewMode } from "./types";

const apiBaseUrl = window.realmork?.apiBaseUrl ?? "";
const apiToken = window.realmork?.apiToken ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Realmork-Token": apiToken,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const fallback = `Request failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error || fallback);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(fallback);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.text();
  if (!payload) {
    return undefined as T;
  }

  return JSON.parse(payload) as T;
}

export function listHomeworks(view: ViewMode): Promise<Homework[]> {
  return request<Homework[]>(`/api/homeworks?view=${view}`);
}

export function getDailyQuote(): Promise<DailyQuote> {
  return request<DailyQuote>("/api/daily-quote");
}

export function createHomework(payload: HomeworkPayload): Promise<Homework> {
  return request<Homework>("/api/homeworks", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateHomework(id: string, payload: HomeworkPayload): Promise<Homework> {
  return request<Homework>(`/api/homeworks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function deleteHomework(id: string): Promise<void> {
  return request<void>(`/api/homeworks/${id}`, {
    method: "DELETE"
  });
}

export function submitHomework(id: string): Promise<Homework> {
  return request<Homework>(`/api/homeworks/${id}/submit`, {
    method: "POST"
  });
}

export function unsubmitHomework(id: string): Promise<Homework> {
  return request<Homework>(`/api/homeworks/${id}/unsubmit`, {
    method: "POST"
  });
}
