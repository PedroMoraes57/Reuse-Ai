import {
  API_BASE_URL,
  buildAuthHeaders,
  clearAuthToken,
  getApiErrorMessage,
  getApiErrorPayload,
  getAuthToken,
} from './api';
import type { GameProfileSummary } from './GamificationApi';

export interface UserInfo {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  avatar_url?: string | null;
  avatar_backup_url?: string | null;
  email_verified?: boolean;
  game_profile?: GameProfileSummary;
  display_name_updated_at?: string | null;
}

export interface LoginError extends Error {
  code?: string;
  email?: string;
}

export interface RegisterPayload {
  username: string;
  password: string;
  password_confirmation: string;
  email: string;
  first_name?: string;
  last_name?: string;
  avatar?: File | null;
}

export interface RegisterResponse {
  detail: string;
  verification_email_sent: boolean;
  verification_link?: string | null;
  user: UserInfo;
}

export async function login(
  identifier: string,
  password: string,
): Promise<{ token: string; user: UserInfo }> {
  const res = await fetch(`${API_BASE_URL}/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) {
    const payload = await getApiErrorPayload(res);
    const error = new Error(
      payload && typeof payload.detail === 'string'
        ? payload.detail
        : 'Não foi possível entrar agora.',
    ) as LoginError;
    if (payload && typeof payload.code === 'string') {
      error.code = payload.code;
    }
    if (payload && typeof payload.email === 'string') {
      error.email = payload.email;
    }
    throw error;
  }
  return res.json();
}

export async function register(
  payload: RegisterPayload,
): Promise<RegisterResponse> {
  const form = new FormData();
  form.append('username', payload.username);
  form.append('email', payload.email);
  form.append('password', payload.password);
  form.append('password_confirmation', payload.password_confirmation);
  if (payload.first_name) {
    form.append('first_name', payload.first_name);
  }
  if (payload.last_name) {
    form.append('last_name', payload.last_name);
  }
  if (payload.avatar) {
    form.append('avatar', payload.avatar);
  }

  const res = await fetch(`${API_BASE_URL}/register/`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    throw new Error(
      await getApiErrorMessage(res, 'Não foi possível concluir o cadastro.'),
    );
  }
  return res.json() as Promise<RegisterResponse>;
}

export async function googleAuthenticate(credential: string): Promise<{
  token: string;
  user: UserInfo;
  is_new_user: boolean;
}> {
  const res = await fetch(`${API_BASE_URL}/google/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });

  if (!res.ok) {
    throw new Error(
      await getApiErrorMessage(
        res,
        'Não foi possível concluir a autenticação com Google.',
      ),
    );
  }

  return res.json();
}

export async function me(): Promise<UserInfo> {
  const token = getAuthToken();
  if (!token) throw new Error('No token');
  const res = await fetch(`${API_BASE_URL}/me/`, {
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

export async function logout(): Promise<void> {
  const token = getAuthToken();
  if (!token) return;
  await fetch(`${API_BASE_URL}/logout/`, {
    method: 'POST',
    headers: buildAuthHeaders(),
  });
  clearAuthToken();
}

export async function verifyEmail(uid: string, token: string) {
  const response = await fetch(`${API_BASE_URL}/verify-email/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, token }),
  });

  if (!response.ok) {
    throw new Error(
      await getApiErrorMessage(
        response,
        'Não foi possível confirmar este e-mail.',
      ),
    );
  }

  return response.json() as Promise<{ detail: string; user?: UserInfo }>;
}

export async function resendVerificationEmail(email: string) {
  const response = await fetch(`${API_BASE_URL}/resend-verification/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw new Error(
      await getApiErrorMessage(
        response,
        'Não foi possível reenviar o e-mail de verificação.',
      ),
    );
  }

  return response.json() as Promise<{ detail: string }>;
}

export async function updateDisplayName(displayName: string): Promise<UserInfo> {
  const response = await fetch(`${API_BASE_URL}/me/username/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
    body: JSON.stringify({ username: displayName }),
  });

  if (!response.ok) {
    const payload = await getApiErrorPayload(response);
    const error = new Error(
      payload && typeof payload.detail === 'string'
        ? payload.detail
        : 'Não foi possível atualizar o nome de exibição.',
    ) as Error & { cooldown_remaining_seconds?: number };
    if (payload && typeof payload.cooldown_remaining_seconds === 'number') {
      (error as Error & { cooldown_remaining_seconds?: number }).cooldown_remaining_seconds =
        payload.cooldown_remaining_seconds;
    }
    throw error;
  }

  return response.json() as Promise<UserInfo>;
}

export async function updateAvatar(file: File): Promise<UserInfo> {
  const form = new FormData();
  form.append('avatar', file);
  const response = await fetch(`${API_BASE_URL}/me/avatar/`, {
    method: 'PUT',
    headers: buildAuthHeaders(),
    body: form,
  });
  if (!response.ok) {
    throw new Error(
      await getApiErrorMessage(response, 'Não foi possível trocar a foto de perfil.'),
    );
  }
  return response.json() as Promise<UserInfo>;
}

export async function revertAvatar(): Promise<UserInfo> {
  const response = await fetch(`${API_BASE_URL}/me/avatar/`, {
    method: 'DELETE',
    headers: buildAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(
      await getApiErrorMessage(response, 'Não foi possível restaurar a foto anterior.'),
    );
  }
  return response.json() as Promise<UserInfo>;
}

export async function requestPasswordReset(email: string): Promise<{ detail: string }> {
  const response = await fetch(`${API_BASE_URL}/password-reset/request/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw new Error(
      await getApiErrorMessage(response, 'Não foi possível enviar o e-mail de recuperação.'),
    );
  }

  return response.json() as Promise<{ detail: string }>;
}

export async function confirmPasswordReset(
  uid: string,
  token: string,
  password: string,
  passwordConfirmation: string,
): Promise<{ detail: string }> {
  const response = await fetch(`${API_BASE_URL}/password-reset/confirm/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, token, password, password_confirmation: passwordConfirmation }),
  });

  if (!response.ok) {
    throw new Error(
      await getApiErrorMessage(response, 'Não foi possível redefinir a senha.'),
    );
  }

  return response.json() as Promise<{ detail: string }>;
}
