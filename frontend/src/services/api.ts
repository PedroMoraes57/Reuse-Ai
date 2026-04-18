export function resolveApiBaseUrl() {
  const explicitApiUrl = import.meta.env.VITE_API_URL;
  if (explicitApiUrl) {
    return explicitApiUrl.replace(/\/$/, '');
  }

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  if (backendUrl) {
    return `${backendUrl.replace(/\/$/, '')}/api`;
  }

  return '/api';
}

export const API_BASE_URL = resolveApiBaseUrl();

export function getAuthToken() {
  return localStorage.getItem('authToken');
}

export function setAuthToken(token: string) {
  localStorage.setItem('authToken', token);
}

export function clearAuthToken() {
  localStorage.removeItem('authToken');
}

export function buildAuthHeaders(headers: HeadersInit = {}) {
  const token = getAuthToken();
  if (!token) {
    return headers;
  }

  return {
    ...headers,
    Authorization: `Token ${token}`,
  };
}

const FIELD_LABELS: Record<string, string> = {
  username: 'Nome de usuário',
  email: 'E-mail',
  first_name: 'Nome',
  last_name: 'Sobrenome',
  password: 'Senha',
  password_confirmation: 'Confirmação de senha',
  credential: 'Credencial Google',
  detail: '',
  non_field_errors: '',
};

function humanizeFieldName(key: string) {
  if (FIELD_LABELS[key] !== undefined) {
    return FIELD_LABELS[key];
  }

  const normalized = key.replace(/_/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function collectPayloadMessages(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const entries = Object.entries(payload as Record<string, unknown>);
  const messages: string[] = [];

  for (const [key, value] of entries) {
    if (key === 'detail' && typeof value === 'string') {
      messages.push(value);
      continue;
    }

    if (Array.isArray(value)) {
      const label = humanizeFieldName(key);
      messages.push(label ? `${label}: ${value.join(', ')}` : value.join(', '));
      continue;
    }

    if (typeof value === 'string') {
      const label = humanizeFieldName(key);
      messages.push(label ? `${label}: ${value}` : value);
      continue;
    }

    if (value && typeof value === 'object') {
      messages.push(...collectPayloadMessages(value));
    }
  }

  return messages;
}

export async function getApiErrorPayload(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  try {
    return (await response.clone().json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function getApiErrorMessage(
  response: Response,
  fallbackMessage: string,
) {
  const payload = await getApiErrorPayload(response);
  if (payload) {
    const messages = collectPayloadMessages(payload);
    if (messages.length > 0) {
      return messages.join(' ');
    }
  }

  const rawText = await response.clone().text();
  return rawText || fallbackMessage;
}
