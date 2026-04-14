const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export interface UserInfo {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

export async function login(username: string, password: string): Promise<{ token: string; user: UserInfo }>{
  const res = await fetch(`${API_BASE_URL}/api/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Login failed');
  }
  return res.json();
}

export async function register(payload: { username: string; password: string; email?: string; first_name?: string; last_name?: string; }) {
  const res = await fetch(`${API_BASE_URL}/api/register/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Register failed');
  }
  return res.json();
}

export async function me(): Promise<UserInfo> {
  const token = localStorage.getItem('authToken');
  if (!token) throw new Error('No token');
  const res = await fetch(`${API_BASE_URL}/api/me/`, {
    headers: { Authorization: `Token ${token}` },
  });
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

export async function logout(): Promise<void> {
  const token = localStorage.getItem('authToken');
  if (!token) return;
  await fetch(`${API_BASE_URL}/api/logout/`, {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
  });
  localStorage.removeItem('authToken');
}
