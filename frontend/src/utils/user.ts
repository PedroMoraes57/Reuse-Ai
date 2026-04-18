import defaultAvatar from '../assets/default-avatar.svg';
import type { UserInfo } from '../services/AuthApi';

export function getUserAvatarUrl(
  user: { avatar_url?: string | null } | null,
) {
  return user?.avatar_url || defaultAvatar;
}

export function getUserDisplayName(user: UserInfo | null) {
  if (!user) {
    return 'Usuário';
  }

  if (user.full_name?.trim()) {
    return user.full_name.trim();
  }

  if (user.first_name?.trim()) {
    return user.first_name.trim();
  }

  return user.username;
}
