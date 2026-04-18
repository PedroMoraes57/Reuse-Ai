import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { AnimatePresence, motion } from 'framer-motion';
import {
  faBell,
  faBolt,
  faCheck,
  faCircleCheck,
  faUserPlus,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import {
  fetchNotifications,
  markNotificationsAsRead,
  respondToBattle,
  respondToFriendRequest,
  type SocialNotification,
} from '../../services/SocialApi';

const TOAST_KINDS = new Set([
  'friend_request',
  'battle_invite',
  'battle_accepted',
  'battle_declined',
  'battle_turn',
  'battle_steal',
  'battle_completed',
]);

const BATTLE_TOAST_KINDS = new Set([
  'battle_invite',
  'battle_accepted',
  'battle_declined',
  'battle_turn',
  'battle_steal',
  'battle_completed',
]);

const TRANSIENT_NOTIFICATION_KINDS = new Set([
  'friend_accepted',
  'battle_accepted',
  'battle_declined',
  'battle_turn',
  'battle_steal',
  'battle_completed',
]);

const NOTIFICATION_POLL_INTERVAL_MS = 1500;
const AUTO_DISMISS_TOAST_MS = 5000;

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function loadDisplayedIds() {
  if (typeof window === 'undefined') {
    return new Set<number>();
  }

  try {
    const raw = window.sessionStorage.getItem('reuseai:displayed-notifications');
    if (!raw) {
      return new Set<number>();
    }
    const parsed = JSON.parse(raw) as number[];
    return new Set(parsed.filter(value => Number.isFinite(value)));
  } catch {
    return new Set<number>();
  }
}

function persistDisplayedIds(ids: Set<number>) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(
    'reuseai:displayed-notifications',
    JSON.stringify(Array.from(ids)),
  );
}

export default function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<SocialNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toastQueue, setToastQueue] = useState<SocialNotification[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const displayedIdsRef = useRef<Set<number>>(loadDisplayedIds());
  const toastTimeoutsRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      try {
        const response = await fetchNotifications();
        if (cancelled) {
          return;
        }

        setNotifications(response.notifications);
        setUnreadCount(response.unread_count);

        const freshToasts = response.notifications.filter(
          notification =>
            notification.read_at === null &&
            TOAST_KINDS.has(notification.kind) &&
            !displayedIdsRef.current.has(notification.id),
        );

        if (freshToasts.length) {
          freshToasts.forEach(notification => {
            displayedIdsRef.current.add(notification.id);
          });
          persistDisplayedIds(displayedIdsRef.current);
          setToastQueue(current => {
            const knownIds = new Set(current.map(item => item.id));
            const next = [...current];
            freshToasts.forEach(notification => {
              if (!knownIds.has(notification.id)) {
                next.push(notification);
              }
            });
            return next.slice(-4);
          });

          const acceptedBattleNotification = freshToasts.find(
            notification => notification.kind === 'battle_accepted' && notification.battle_id,
          );
          if (
            acceptedBattleNotification?.battle_id &&
            window.location.pathname !== `/amigos/batalhas/${acceptedBattleNotification.battle_id}`
          ) {
            void markNotificationsAsRead([acceptedBattleNotification.id]).catch(() => {
              // Redirect should not depend on read marking.
            });
            window.setTimeout(() => {
              window.location.href = `/amigos/batalhas/${acceptedBattleNotification.battle_id}`;
            }, 150);
          }
        }
      } catch {
        // Best effort polling for realtime updates.
      }
    }

    void loadNotifications();
    const intervalId = window.setInterval(() => {
      void loadNotifications();
    }, NOTIFICATION_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    toastQueue.forEach(notification => {
      if (
        BATTLE_TOAST_KINDS.has(notification.kind) ||
        toastTimeoutsRef.current.has(notification.id)
      ) {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        toastTimeoutsRef.current.delete(notification.id);
        setToastQueue(current =>
          current.filter(item => item.id !== notification.id),
        );
      }, AUTO_DISMISS_TOAST_MS);

      toastTimeoutsRef.current.set(notification.id, timeoutId);
    });

    const activeToastIds = new Set(toastQueue.map(notification => notification.id));
    toastTimeoutsRef.current.forEach((timeoutId, notificationId) => {
      if (!activeToastIds.has(notificationId)) {
        window.clearTimeout(timeoutId);
        toastTimeoutsRef.current.delete(notificationId);
      }
    });
  }, [toastQueue]);

  useEffect(() => {
    return () => {
      toastTimeoutsRef.current.forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
      toastTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const unreadIds = notifications
      .filter(notification => notification.read_at === null)
      .map(notification => notification.id);

    if (!unreadIds.length) {
      return;
    }

    void markNotificationsAsRead(unreadIds)
      .then(() => {
        const nowIso = new Date().toISOString();
        setNotifications(current =>
          current
            .map(notification =>
              unreadIds.includes(notification.id)
                ? { ...notification, read_at: nowIso }
                : notification,
            )
            .filter(
              notification =>
                !(
                  TRANSIENT_NOTIFICATION_KINDS.has(notification.kind) &&
                  notification.read_at !== null
                ),
            ),
        );
        setUnreadCount(0);
      })
      .catch(() => {
        // Dropdown should still open even if marking fails.
      });
  }, [isOpen, notifications]);

  function dismissToast(notificationId: number) {
    const timeoutId = toastTimeoutsRef.current.get(notificationId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      toastTimeoutsRef.current.delete(notificationId);
    }
    setToastQueue(current => current.filter(item => item.id !== notificationId));
  }

  function removeNotification(notificationId: number) {
    setNotifications(current => {
      const target = current.find(notification => notification.id === notificationId);
      if (target?.read_at === null) {
        setUnreadCount(value => Math.max(0, value - 1));
      }
      return current.filter(notification => notification.id !== notificationId);
    });
  }

  async function handleFriendRequest(notification: SocialNotification) {
    const friendshipId = Number(notification.friendship_id);
    if (!Number.isFinite(friendshipId)) {
      return;
    }

    setBusyKey(`friend:${notification.id}`);
    try {
      await respondToFriendRequest(friendshipId, 'accept');
      dismissToast(notification.id);
      removeNotification(notification.id);
      const response = await fetchNotifications();
      setNotifications(response.notifications);
      setUnreadCount(response.unread_count);
    } catch {
      // Keep notification visible so the user can try again.
    } finally {
      setBusyKey(null);
    }
  }

  async function handleBattleInvite(
    notification: SocialNotification,
    action: 'accept' | 'decline',
  ) {
    const battleId = Number(notification.battle_id);
    if (!Number.isFinite(battleId)) {
      return;
    }

    setBusyKey(`battle:${notification.id}:${action}`);
    try {
      await respondToBattle(battleId, action);
      dismissToast(notification.id);
      removeNotification(notification.id);
      const response = await fetchNotifications();
      setNotifications(response.notifications);
      setUnreadCount(response.unread_count);
      if (action === 'accept') {
        window.location.href = `/amigos/batalhas/${battleId}`;
      }
    } catch {
      // Keep notification visible so the user can try again.
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <>
      <div className='relative' ref={dropdownRef}>
        <button
          type='button'
          onClick={() => setIsOpen(current => !current)}
          className='relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-reuseai-branco transition-colors hover:bg-white/15'
          aria-label='Notificações'
        >
          <FontAwesomeIcon icon={faBell} className='text-base' />
          {unreadCount > 0 && (
            <span className='absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-reuseai-verde px-1.5 py-0.5 text-[11px] font-bold text-reuseai-branco'>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {isOpen && (
          <div className='absolute right-0 top-full z-50 mt-4 w-[22rem] overflow-hidden rounded-2xl border border-gray-200 bg-reuseai-branco shadow-xl dark:border-[#2d2d2d] dark:bg-[#101915]'>
            <div className='flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-[#1f2b22]'>
              <div>
                <p className='text-xs font-semibold uppercase tracking-[0.22em] text-reuseai-verde'>
                  Notificações
                </p>
                <p className='mt-1 text-sm text-reuseai-cinza dark:text-white/60'>
                  Atualização contínua de amizade e batalha
                </p>
              </div>
            </div>

            <div className='max-h-[28rem] overflow-y-auto p-3'>
              {notifications.length === 0 && (
                <div className='rounded-2xl border border-dashed border-reuseai-verde/20 bg-reuseai-verde/5 px-4 py-6 text-sm text-reuseai-cinza dark:border-reuseai-verdeNeon/15 dark:bg-[#0f1813] dark:text-white/70'>
                  Nenhuma notificação por enquanto.
                </div>
              )}

              <div className='space-y-3'>
                {notifications.map(notification => (
                  <div
                    key={notification.id}
                    className={`rounded-2xl border px-4 py-4 ${
                      notification.read_at
                        ? 'border-reuseai-verde/10 bg-white dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'
                        : 'border-reuseai-verde/20 bg-reuseai-verde/5 dark:border-reuseai-verdeNeon/20 dark:bg-[#132017]'
                    }`}
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <p className='text-sm font-bold text-reuseai-preto dark:text-reuseai-branco'>
                          {notification.title}
                        </p>
                        <p className='mt-2 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
                          {notification.message}
                        </p>
                        <p className='mt-2 text-xs text-reuseai-cinza dark:text-white/50'>
                          {formatDate(notification.created_at)}
                        </p>
                      </div>
                      {!notification.read_at && (
                        <span className='mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-reuseai-verde' />
                      )}
                    </div>

                    {notification.kind === 'friend_request' &&
                      notification.friendship_id && (
                        <div className='mt-4 flex gap-2'>
                          <button
                            type='button'
                            disabled={busyKey === `friend:${notification.id}`}
                            onClick={() => void handleFriendRequest(notification)}
                            className='inline-flex items-center gap-2 rounded-full bg-reuseai-verde px-4 py-2 text-xs font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
                          >
                            <FontAwesomeIcon icon={faUserPlus} />
                            Aceitar amizade
                          </button>
                        </div>
                      )}

                    {notification.kind === 'battle_invite' && notification.battle_id && (
                      <div className='mt-4 flex flex-wrap gap-2'>
                        <button
                          type='button'
                          disabled={busyKey === `battle:${notification.id}:accept`}
                          onClick={() => void handleBattleInvite(notification, 'accept')}
                          className='inline-flex items-center gap-2 rounded-full bg-reuseai-verde px-4 py-2 text-xs font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
                        >
                          <FontAwesomeIcon icon={faCircleCheck} />
                          Aceitar
                        </button>
                        <button
                          type='button'
                          disabled={busyKey === `battle:${notification.id}:decline`}
                          onClick={() => void handleBattleInvite(notification, 'decline')}
                          className='inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100'
                        >
                          <FontAwesomeIcon icon={faXmark} />
                          Recusar
                        </button>
                      </div>
                    )}

                    {!notification.is_actionable && notification.battle_id && (
                      <div className='mt-4'>
                        <a
                          href={`/amigos/batalhas/${notification.battle_id}`}
                          className='inline-flex items-center gap-2 rounded-full border border-reuseai-verde/15 bg-white px-4 py-2 text-xs font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/5 dark:border-reuseai-verdeNeon/15 dark:bg-[#132017] dark:text-reuseai-branco'
                        >
                          <FontAwesomeIcon icon={faBolt} />
                          Abrir batalha
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className='pointer-events-none fixed right-4 top-20 z-[1200] flex w-[22rem] flex-col gap-3'>
        <AnimatePresence initial={false}>
          {toastQueue.map(notification => (
            <motion.div
              layout
              key={notification.id}
              initial={{ opacity: 0, x: 24, y: -10, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, y: -10, scale: 0.97 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className='pointer-events-auto rounded-2xl border border-reuseai-verde/20 bg-white/95 p-4 shadow-[0_20px_50px_-24px_rgba(28,28,37,0.45)] backdrop-blur dark:border-reuseai-verdeNeon/15 dark:bg-[#101915]/95'
            >
              <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0'>
                  <p className='text-sm font-bold text-reuseai-preto dark:text-reuseai-branco'>
                    {notification.title}
                  </p>
                  <p className='mt-2 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
                    {notification.message}
                  </p>
                </div>
                <button
                  type='button'
                  onClick={() => dismissToast(notification.id)}
                  className='mt-0.5 text-reuseai-cinza transition-colors hover:text-reuseai-preto dark:text-white/60 dark:hover:text-reuseai-branco'
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>

              {notification.kind === 'friend_request' && notification.friendship_id && (
                <div className='mt-4'>
                  <button
                    type='button'
                    disabled={busyKey === `friend:${notification.id}`}
                    onClick={() => void handleFriendRequest(notification)}
                    className='inline-flex items-center gap-2 rounded-full bg-reuseai-verde px-4 py-2 text-xs font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
                  >
                    <FontAwesomeIcon icon={faCheck} />
                    Aceitar amizade
                  </button>
                </div>
              )}

              {notification.kind === 'battle_invite' && notification.battle_id && (
                <div className='mt-4 flex flex-wrap gap-2'>
                  <button
                    type='button'
                    disabled={busyKey === `battle:${notification.id}:accept`}
                    onClick={() => void handleBattleInvite(notification, 'accept')}
                    className='inline-flex items-center gap-2 rounded-full bg-reuseai-verde px-4 py-2 text-xs font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
                  >
                    <FontAwesomeIcon icon={faCircleCheck} />
                    Aceitar
                  </button>
                  <button
                    type='button'
                    disabled={busyKey === `battle:${notification.id}:decline`}
                    onClick={() => void handleBattleInvite(notification, 'decline')}
                    className='inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100'
                  >
                    <FontAwesomeIcon icon={faXmark} />
                    Recusar
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
