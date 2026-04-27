import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBolt,
  faCircleCheck,
  faClock,
  faMagnifyingGlass,
  faMedal,
  faUserCheck,
  faUserClock,
  faUserGroup,
  faUserPlus,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { motion } from 'framer-motion';
import Navbar from '../components/LandingPage/Navbar';
import Footer from '../components/LandingPage/Footer';
import {
  createBattle,
  fetchSocialOverview,
  respondToBattle,
  respondToFriendRequest,
  searchSocialUsers,
  sendFriendRequest,
  type BattleSummary,
  type SocialOverview,
  type SocialSearchResult,
} from '../services/SocialApi';
import { getAuthToken } from '../services/api';
import { getUserAvatarUrl } from '../utils/user';
import { fadeUp, staggerContainer, staggerItem } from '../utils/animations';

const BASE_BATTLE_QUESTION_COUNT = 6;

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function SectionCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      variants={fadeUp}
      initial='hidden'
      whileInView='visible'
      viewport={{ once: true, margin: '-60px' }}
      className='rounded-[30px] border border-reuseai-verde/10 bg-white/92 p-6 shadow-[0_30px_90px_-60px_rgba(28,28,37,0.45)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/92'
    >
      <p className='text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
        {eyebrow}
      </p>
      <h2 className='mt-2 text-2xl font-black text-reuseai-preto dark:text-reuseai-branco'>
        {title}
      </h2>
      {description && (
        <p className='mt-3 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
          {description}
        </p>
      )}
      <div className='mt-6'>{children}</div>
    </motion.section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className='rounded-3xl border border-dashed border-reuseai-verde/20 bg-reuseai-verde/5 px-5 py-7 text-sm leading-6 text-reuseai-cinza dark:border-reuseai-verdeNeon/15 dark:bg-[#0f1813] dark:text-white/70'>
      {text}
    </div>
  );
}

export default function FriendsPage() {
  const [overview, setOverview] = useState<SocialOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SocialSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!getAuthToken()) {
      window.location.href = '/login?next=/amigos';
      return;
    }

    setIsLoading(true);
    setError(null);
    fetchSocialOverview()
      .then(setOverview)
      .catch(err => {
        setError(
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar sua página de amigos.',
        );
      })
      .finally(() => setIsLoading(false));
  }, [reloadKey]);

  useEffect(() => {
    if (!getAuthToken()) {
      return;
    }

    const intervalId = window.setInterval(() => {
      fetchSocialOverview()
        .then(setOverview)
        .catch(() => {
          // Best effort realtime refresh.
        });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, []);

  function refreshOverview() {
    setReloadKey(value => value + 1);
  }

  async function refreshSearchIfNeeded() {
    const normalizedQuery = searchQuery.trim();
    if (!normalizedQuery) {
      return;
    }

    try {
      const response = await searchSocialUsers(normalizedQuery);
      setSearchResults(response.results);
    } catch {
      // The overview refresh is the priority after actions; stale search results are acceptable.
    }
  }

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuery = searchQuery.trim();
    if (!normalizedQuery) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    setFeedback(null);
    try {
      const response = await searchSocialUsers(normalizedQuery);
      setSearchResults(response.results);
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Não foi possível buscar usuários agora.',
      });
    } finally {
      setSearching(false);
    }
  }

  async function handleSendFriendRequest(username: string) {
    setBusyKey(`friend:${username}`);
    setFeedback(null);
    try {
      const response = await sendFriendRequest(username);
      setFeedback({ type: 'success', message: response.detail });
      refreshOverview();
      await refreshSearchIfNeeded();
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Não foi possível enviar o pedido de amizade.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleFriendRequestAction(
    requestId: number,
    action: 'accept' | 'decline',
  ) {
    setBusyKey(`request:${requestId}:${action}`);
    setFeedback(null);
    try {
      const response = await respondToFriendRequest(requestId, action);
      setFeedback({
        type: 'success',
        message: response.detail,
      });
      refreshOverview();
      await refreshSearchIfNeeded();
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Não foi possível responder a esse pedido.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCreateBattle(username: string) {
    setBusyKey(`battle:create:${username}`);
    setFeedback(null);
    try {
      const response = await createBattle(username);
      setFeedback({ type: 'success', message: response.detail });
      refreshOverview();
      await refreshSearchIfNeeded();
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Não foi possível enviar o desafio agora.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleBattleAction(
    battleId: number,
    action: 'accept' | 'decline',
  ) {
    setBusyKey(`battle:${battleId}:${action}`);
    setFeedback(null);
    try {
      await respondToBattle(battleId, action);
      if (action === 'accept') {
        window.location.href = `/amigos/batalhas/${battleId}`;
        return;
      }

      setFeedback({
        type: 'success',
        message: 'Convite recusado.',
      });
      refreshOverview();
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Não foi possível responder a essa batalha.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  function renderBattleList(items: BattleSummary[], emptyText: string) {
    if (!items.length) {
      return <EmptyState text={emptyText} />;
    }

    return (
      <motion.div
        variants={staggerContainer}
        initial='hidden'
        whileInView='visible'
        viewport={{ once: true, margin: '-40px' }}
        className='space-y-4'
      >
        {items.map(battle => (
          <motion.div
            key={battle.id}
            variants={staggerItem}
            className='rounded-3xl border border-reuseai-verde/10 bg-reuseai-verde/5 p-5 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'
          >
            <div className='flex items-center justify-between gap-4'>
              <div className='min-w-0'>
                <div className='flex items-center gap-3'>
                  <img
                    src={getUserAvatarUrl(battle.opponent)}
                    alt={battle.opponent.username}
                    className='h-12 w-12 rounded-full border border-reuseai-verde/15 object-cover'
                  />
                  <div className='min-w-0'>
                    <a
                      href={`/usuarios/${battle.opponent.username}`}
                      className='truncate text-lg font-bold text-reuseai-preto transition-colors hover:text-reuseai-verde dark:text-reuseai-branco'
                    >
                      @{battle.opponent.username}
                    </a>
                    <p className='mt-1 text-sm text-reuseai-cinza dark:text-white/65'>
                      {battle.title} • {battle.question_count} perguntas
                    </p>
                  </div>
                </div>
                <p className='mt-4 text-sm text-reuseai-cinza dark:text-white/65'>
                  Atualizado em {formatDate(battle.updated_at)}
                </p>
                {battle.status === 'active' && (
                  <p className='mt-2 text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                    {battle.current_question_is_tiebreak
                      ? battle.is_my_turn
                        ? `Sua vez no desempate ${battle.current_question_index - (BASE_BATTLE_QUESTION_COUNT - 1)}`
                        : `Desempate em andamento para @${battle.current_turn_username ?? battle.opponent.username}`
                      : battle.is_my_turn
                        ? `Sua vez na pergunta ${battle.current_question_index + 1}`
                      : battle.current_phase === 'steal'
                        ? `Roubo em andamento para @${battle.current_turn_username ?? battle.opponent.username}`
                        : `Turno atual: @${battle.current_turn_username ?? battle.opponent.username}`}
                  </p>
                )}
                {battle.status === 'completed' && (
                  <p className='mt-2 text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                    Placar: {battle.my_score} x {battle.opponent_score}
                  </p>
                )}
              </div>

              <div className='flex shrink-0 flex-wrap gap-2'>
                {battle.can_respond_to_invite && (
                  <>
                    <button
                      type='button'
                      disabled={busyKey === `battle:${battle.id}:accept`}
                      onClick={() => void handleBattleAction(battle.id, 'accept')}
                      className='inline-flex items-center gap-1.5 rounded-full bg-reuseai-verde px-3 py-2 text-xs font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
                    >
                      <FontAwesomeIcon icon={faCircleCheck} />
                      Aceitar
                    </button>
                    <button
                      type='button'
                      disabled={busyKey === `battle:${battle.id}:decline`}
                      onClick={() => void handleBattleAction(battle.id, 'decline')}
                      className='inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/15'
                    >
                      <FontAwesomeIcon icon={faXmark} />
                      Recusar
                    </button>
                  </>
                )}

                {!battle.can_respond_to_invite && (
                  <a
                    href={`/amigos/batalhas/${battle.id}`}
                    className='inline-flex items-center gap-1.5 rounded-full border border-reuseai-verde/15 bg-white px-3 py-2 text-xs font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/5 dark:border-reuseai-verdeNeon/15 dark:bg-[#132017] dark:text-reuseai-branco'
                  >
                    <FontAwesomeIcon icon={faBolt} />
                    Abrir batalha
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    );
  }

  return (
    <>
      <Navbar isStatic forceScrolled />
      <main className='min-h-screen bg-gradient-to-b from-reuseai-branco via-reuseai-branco to-reuseai-verdeClaro/10 px-4 py-10 dark:from-[#09100b] dark:via-[#0b100d] dark:to-[#122018] md:px-6 md:py-16'>
        <div className='mx-auto max-w-6xl'>
          <motion.section
            data-tutorial='friends-hero'
            variants={fadeUp}
            initial='hidden'
            animate='visible'
            className='rounded-[34px] border border-reuseai-verde/10 bg-white/92 p-6 shadow-[0_40px_100px_-60px_rgba(28,28,37,0.45)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/92 md:p-8'
          >
            <div className='flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between'>
              <div className='max-w-2xl'>
                <p className='text-xs font-semibold uppercase tracking-[0.28em] text-reuseai-verde'>
                  Rede Circular
                </p>
                <h1 className='mt-4 text-4xl font-black leading-tight text-reuseai-preto dark:text-reuseai-branco md:text-5xl'>
                  Amigos, convites e batalhas sustentáveis no mesmo lugar.
                </h1>
                <p className='mt-4 text-base leading-7 text-reuseai-cinza dark:text-white/70'>
                  Encontre pessoas pelo username, monte sua rede e lance
                  quizzes rápidos sobre reciclagem e sustentabilidade para
                  ganhar um pouco de XP junto com a comunidade.
                </p>
              </div>

              <div className='grid gap-4 sm:grid-cols-3 lg:w-[24rem]'>
                {[
                  {
                    icon: faUserGroup,
                    label: 'Amigos',
                    value: overview ? formatNumber(overview.friends.length) : '--',
                  },
                  {
                    icon: faUserClock,
                    label: 'Convites',
                    value: overview
                      ? formatNumber(overview.incoming_requests.length)
                      : '--',
                  },
                  {
                    icon: faMedal,
                    label: 'Batalhas',
                    value: overview
                      ? formatNumber(
                          overview.battles.active.length +
                            overview.battles.completed.length,
                        )
                      : '--',
                  },
                ].map(stat => (
                  <div
                    key={stat.label}
                    className='rounded-3xl border border-reuseai-verde/10 bg-reuseai-verde/5 p-4 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'
                  >
                    <p className='flex items-center gap-2 text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                      <FontAwesomeIcon icon={stat.icon} className='text-reuseai-verde' />
                      {stat.label}
                    </p>
                    <p className='mt-3 text-3xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>

          {feedback && (
            <div
              className={`mt-6 rounded-3xl border px-5 py-4 text-sm font-medium ${
                feedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100'
                  : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100'
              }`}
            >
              {feedback.message}
            </div>
          )}

          {isLoading && (
            <div className='mt-8 rounded-3xl border border-reuseai-verde/10 bg-white/90 px-6 py-16 text-center text-sm font-semibold text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/90 dark:text-white/65'>
              Carregando sua central social...
            </div>
          )}

          {!isLoading && error && (
            <div className='mt-8 rounded-3xl border border-red-200 bg-red-50 px-6 py-5 text-sm font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100'>
              {error}
            </div>
          )}

          {!isLoading && !error && overview && (
            <div className='mt-8 space-y-6'>
              {/* Row 1: Search + Add Friends (full width) */}
              <SectionCard
                eyebrow='Encontrar pessoas'
                title='Adicionar amigos'
                description='Busque por username para enviar convites ou visitar o perfil público do usuário.'
              >
                <form onSubmit={handleSearchSubmit} className='flex gap-3'>
                  <input
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder='Ex.: LeoPCD'
                    className='h-11 flex-1 rounded-full border border-reuseai-verde/15 bg-white px-5 text-sm text-reuseai-preto outline-none ring-0 placeholder:text-reuseai-cinza/70 focus:border-reuseai-verde dark:border-reuseai-verdeNeon/15 dark:bg-[#132017] dark:text-reuseai-branco'
                  />
                  <button
                    type='submit'
                    disabled={searching}
                    className='inline-flex h-11 items-center justify-center gap-2 rounded-full bg-reuseai-verde px-5 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
                  >
                    <FontAwesomeIcon icon={faMagnifyingGlass} />
                    {searching ? 'Buscando...' : 'Buscar'}
                  </button>
                </form>

                {(searchResults.length > 0 || (!searching && searchQuery.trim())) && (
                  <div className='mt-5'>
                    {searchResults.length === 0 ? (
                      <EmptyState text='Nenhum usuário encontrado com esse termo. Tente buscar pelo username exato ou por parte dele.' />
                    ) : (
                      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
                        {searchResults.map(result => (
                          <div
                            key={result.user.id}
                            className='flex flex-col gap-3 rounded-3xl border border-reuseai-verde/10 bg-reuseai-verde/5 p-4 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'
                          >
                            <div className='flex min-w-0 items-center gap-3'>
                              <img
                                src={getUserAvatarUrl(result.user)}
                                alt={result.user.username}
                                className='h-11 w-11 rounded-full border border-reuseai-verde/15 object-cover'
                              />
                              <div className='min-w-0'>
                                <a
                                  href={`/usuarios/${result.user.username}`}
                                  className='block truncate text-sm font-bold text-reuseai-preto transition-colors hover:text-reuseai-verde dark:text-reuseai-branco'
                                >
                                  @{result.user.username}
                                </a>
                                <p className='mt-0.5 text-xs text-reuseai-cinza dark:text-white/65'>
                                  Nível {result.user.game_profile.level} • {result.user.game_profile.level_title}
                                </p>
                              </div>
                            </div>

                            <div className='flex flex-wrap gap-2'>
                              {result.relationship.status === 'none' && (
                                <button
                                  type='button'
                                  disabled={busyKey === `friend:${result.user.username}`}
                                  onClick={() => void handleSendFriendRequest(result.user.username)}
                                  className='inline-flex items-center gap-1.5 rounded-full bg-reuseai-verde px-3 py-2 text-xs font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
                                >
                                  <FontAwesomeIcon icon={faUserPlus} />
                                  Adicionar
                                </button>
                              )}
                              {result.relationship.status === 'friends' && (
                                <button
                                  type='button'
                                  disabled={busyKey === `battle:create:${result.user.username}`}
                                  onClick={() => void handleCreateBattle(result.user.username)}
                                  className='inline-flex items-center gap-1.5 rounded-full border border-reuseai-verde/15 bg-white px-3 py-2 text-xs font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-reuseai-verdeNeon/15 dark:bg-[#132017] dark:text-reuseai-branco'
                                >
                                  <FontAwesomeIcon icon={faBolt} />
                                  Desafiar
                                </button>
                              )}
                              {result.relationship.status === 'incoming_request' && (
                                <button
                                  type='button'
                                  disabled={busyKey === `request:${result.relationship.friendship_id}:accept`}
                                  onClick={() => {
                                    if (!result.relationship.friendship_id) return;
                                    void handleFriendRequestAction(result.relationship.friendship_id, 'accept');
                                  }}
                                  className='inline-flex items-center gap-1.5 rounded-full border border-reuseai-verde/15 bg-white px-3 py-2 text-xs font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-reuseai-verdeNeon/15 dark:bg-[#132017] dark:text-reuseai-branco'
                                >
                                  <FontAwesomeIcon icon={faUserCheck} />
                                  Aceitar pedido
                                </button>
                              )}
                              {result.relationship.status === 'outgoing_request' && (
                                <span className='inline-flex items-center gap-1.5 rounded-full bg-reuseai-verde/10 px-3 py-2 text-xs font-semibold text-reuseai-verde'>
                                  <FontAwesomeIcon icon={faClock} />
                                  Pendente
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </SectionCard>

              {/* Row 2: Incoming friend requests + Friends list */}
              <div className='grid gap-6 lg:grid-cols-2'>
                <SectionCard
                  eyebrow='Pedidos'
                  title='Pedidos de amizade recebidos'
                  description='Aceite quem você quer trazer para a sua rede e desbloqueie futuras batalhas.'
                >
                  {overview.incoming_requests.length === 0 ? (
                    <EmptyState text='Nenhum pedido recebido por enquanto.' />
                  ) : (
                    <div className='space-y-3'>
                      {overview.incoming_requests.map(request => (
                        <div
                          key={request.id}
                          className='rounded-3xl border border-reuseai-verde/10 bg-reuseai-verde/5 p-4 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'
                        >
                          <div className='flex items-center gap-3'>
                            <img
                              src={getUserAvatarUrl(request.user)}
                              alt={request.user.username}
                              className='h-11 w-11 shrink-0 rounded-full border border-reuseai-verde/15 object-cover'
                            />
                            <div className='min-w-0 flex-1'>
                              <a
                                href={`/usuarios/${request.user.username}`}
                                className='block truncate text-sm font-bold text-reuseai-preto transition-colors hover:text-reuseai-verde dark:text-reuseai-branco'
                              >
                                @{request.user.username}
                              </a>
                              <p className='mt-0.5 text-xs text-reuseai-cinza dark:text-white/65'>
                                {formatDate(request.created_at)}
                              </p>
                            </div>
                            <div className='flex shrink-0 gap-2'>
                              <button
                                type='button'
                                disabled={busyKey === `request:${request.id}:accept`}
                                onClick={() => void handleFriendRequestAction(request.id, 'accept')}
                                className='inline-flex items-center gap-1.5 rounded-full bg-reuseai-verde px-3 py-2 text-xs font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
                              >
                                <FontAwesomeIcon icon={faCircleCheck} />
                                Aceitar
                              </button>
                              <button
                                type='button'
                                disabled={busyKey === `request:${request.id}:decline`}
                                onClick={() => void handleFriendRequestAction(request.id, 'decline')}
                                className='inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/15'
                              >
                                <FontAwesomeIcon icon={faXmark} />
                                Recusar
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  eyebrow='Sua rede'
                  title='Amigos conectados'
                  description='Use o perfil público para conhecer melhor cada pessoa e enviar desafios sempre que quiser.'
                >
                  {overview.friends.length === 0 ? (
                    <EmptyState text='Você ainda não tem amigos adicionados. Use a busca acima para começar sua rede.' />
                  ) : (
                    <div className='space-y-3'>
                      {overview.friends.map(friend => (
                        <div
                          key={friend.id}
                          className='rounded-3xl border border-reuseai-verde/10 bg-reuseai-verde/5 p-4 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'
                        >
                          <div className='flex items-center gap-3'>
                            <img
                              src={getUserAvatarUrl(friend.user)}
                              alt={friend.user.username}
                              className='h-11 w-11 shrink-0 rounded-full border border-reuseai-verde/15 object-cover'
                            />
                            <div className='min-w-0 flex-1'>
                              <a
                                href={`/usuarios/${friend.user.username}`}
                                className='block truncate text-sm font-bold text-reuseai-preto transition-colors hover:text-reuseai-verde dark:text-reuseai-branco'
                              >
                                @{friend.user.username}
                              </a>
                              <p className='mt-0.5 text-xs text-reuseai-cinza dark:text-white/65'>
                                Nível {friend.user.game_profile.level} • {friend.user.game_profile.level_title}
                              </p>
                              <p className='mt-0.5 text-xs text-reuseai-cinza dark:text-white/65'>
                                {formatNumber(friend.user.game_profile.xp_total)} XP • {formatNumber(friend.user.game_profile.total_analyses)} análises
                              </p>
                            </div>
                            <div className='flex shrink-0 flex-wrap gap-2'>
                              <a
                                href={`/usuarios/${friend.user.username}`}
                                className='inline-flex items-center gap-1.5 rounded-full border border-reuseai-verde/15 bg-white px-3 py-2 text-xs font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/5 dark:border-reuseai-verdeNeon/15 dark:bg-[#132017] dark:text-reuseai-branco'
                              >
                                Perfil
                              </a>
                              <button
                                type='button'
                                disabled={busyKey === `battle:create:${friend.user.username}`}
                                onClick={() => void handleCreateBattle(friend.user.username)}
                                className='inline-flex items-center gap-1.5 rounded-full bg-reuseai-verde px-3 py-2 text-xs font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
                              >
                                <FontAwesomeIcon icon={faBolt} />
                                Batalha
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>

              {/* Row 3: Battle invites received + Active battles */}
              <div className='grid gap-6 lg:grid-cols-2'>
                <SectionCard
                  eyebrow='Batalhas'
                  title='Convites de batalha recebidos'
                  description='Aceite um desafio e entre em um quiz compartilhado em tempo real para comparar seu placar com o do seu amigo.'
                >
                  {renderBattleList(
                    overview.battles.pending_received,
                    'Nenhum convite de batalha aguardando sua resposta.',
                  )}
                </SectionCard>

                <SectionCard
                  eyebrow='Em andamento'
                  title='Batalhas ativas'
                  description='Acompanhe o turno atual, veja quando houver roubo ou desempate e abra o quiz compartilhado com um clique.'
                >
                  {renderBattleList(
                    overview.battles.active,
                    'Nenhuma batalha ativa agora.',
                  )}
                </SectionCard>
              </div>

              {/* Row 4: History (full width) */}
              <SectionCard
                eyebrow='Histórico'
                title='Convites enviados e histórico'
                description='Acompanhe desafios já finalizados e também os convites que ainda aguardam resposta do outro lado.'
              >
                <div className='grid gap-6 lg:grid-cols-2'>
                  <div>
                    <p className='mb-3 text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                      Convites enviados
                    </p>
                    <div className='max-h-96 overflow-y-auto pr-1'>
                      {renderBattleList(
                        overview.battles.pending_sent,
                        'Nenhum convite enviado aguardando resposta.',
                      )}
                    </div>
                  </div>
                  <div>
                    <p className='mb-3 text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                      Concluídas
                    </p>
                    <div className='max-h-96 overflow-y-auto pr-1'>
                      {renderBattleList(
                        overview.battles.completed,
                        'Suas próximas batalhas concluídas aparecerão aqui.',
                      )}
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
