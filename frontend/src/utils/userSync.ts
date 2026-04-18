import type { UserInfo } from '../services/AuthApi';

const USER_UPDATED_EVENT = 'reuseai:user-updated';
const USER_CLEARED_EVENT = 'reuseai:user-cleared';

export function dispatchUserUpdated(user: UserInfo) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<UserInfo>(USER_UPDATED_EVENT, {
      detail: user,
    }),
  );
}

export function dispatchUserCleared() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(USER_CLEARED_EVENT));
}

export function subscribeToUserSync(
  onUserUpdated: (user: UserInfo) => void,
  onUserCleared?: () => void,
) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  function handleUserUpdated(event: Event) {
    const customEvent = event as CustomEvent<UserInfo>;
    if (customEvent.detail) {
      onUserUpdated(customEvent.detail);
    }
  }

  function handleUserCleared() {
    onUserCleared?.();
  }

  window.addEventListener(USER_UPDATED_EVENT, handleUserUpdated as EventListener);
  window.addEventListener(USER_CLEARED_EVENT, handleUserCleared);

  return () => {
    window.removeEventListener(
      USER_UPDATED_EVENT,
      handleUserUpdated as EventListener,
    );
    window.removeEventListener(USER_CLEARED_EVENT, handleUserCleared);
  };
}
