import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBolt,
  faLeaf,
  faMedal,
  faRecycle,
  faUserCheck,
  faUserPlus,
} from '@fortawesome/free-solid-svg-icons';
import { motion } from 'framer-motion';
import Navbar from '../components/LandingPage/Navbar';
import Footer from '../components/LandingPage/Footer';
import {
  createBattle,
  fetchPublicProfile,
  respondToFriendRequest,
  sendFriendRequest,
  type PublicProfileResponse,
} from '../services/SocialApi';
import { getAuthToken } from '../services/api';
import { getUserAvatarUrl } from '../utils/user';
import { fadeUp, staggerContainer, staggerItem } from '../utils/animations';

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value);
}

export default function PublicProfilePage() {
  const { username = '' } = useParams();
  const [profile, setProfile] = useState<PublicProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!username) {
      setError('Usuário inválido.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    fetchPublicProfile(username)
      .then(setProfile)
      .catch(err => {
        setError(
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar este perfil agora.',
        );
      })
      .finally(() => setIsLoading(false));
  }, [reloadKey, username]);

  useEffect(() => {
    if (!username) {
      return;
    }

    const intervalId = window.setInterval(() => {
      fetchPublicProfile(username)
        .then(setProfile)
        .catch(() => {
          // Best effort realtime refresh.
        });
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [username]);

  function refreshProfile() {
    setReloadKey(value => value + 1);
  }

  function ensureAuthenticated() {
    if (getAuthToken()) {
      return true;
    }

    window.location.href = `/login?next=/usuarios/${username}`;
    return false;
  }

  async function handleAddFriend() {
    if (!ensureAuthenticated()) {
      return;
    }

    setBusyAction('add-friend');
    setFeedback(null);
    try {
      const response = await sendFriendRequest(username);
      setFeedback({ type: 'success', message: response.detail });
      refreshProfile();
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Não foi possível enviar o pedido de amizade.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAcceptRequest() {
    if (!ensureAuthenticated() || !profile?.relationship.friendship_id) {
      return;
    }

    setBusyAction('accept-friend');
    setFeedback(null);
    try {
      const response = await respondToFriendRequest(
        profile.relationship.friendship_id,
        'accept',
      );
      setFeedback({ type: 'success', message: response.detail });
      refreshProfile();
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Não foi possível aceitar o pedido.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateBattle() {
    if (!ensureAuthenticated()) {
      return;
    }

    setBusyAction('create-battle');
    setFeedback(null);
    try {
      const response = await createBattle(username);
      setFeedback({ type: 'success', message: response.detail });
      refreshProfile();
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Não foi possível enviar o desafio agora.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  const user = profile?.user;
  const relationship = profile?.relationship;
  const showFullName =
    user?.full_name?.trim() &&
    user.full_name.trim().toLowerCase() !== user.username.trim().toLowerCase();

  return (
    <>
      <Navbar isStatic forceScrolled />
      <main className='min-h-screen bg-gradient-to-b from-reuseai-branco via-reuseai-branco to-reuseai-verdeClaro/10 px-4 py-10 dark:from-[#09100b] dark:via-[#0b100d] dark:to-[#122018] md:px-6 md:py-16'>
        <div className='mx-auto max-w-5xl'>
          {feedback && (
            <div
              className={`mb-6 rounded-3xl border px-5 py-4 text-sm font-medium ${
                feedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100'
                  : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100'
              }`}
            >
              {feedback.message}
            </div>
          )}

          {isLoading && (
            <div className='rounded-3xl border border-reuseai-verde/10 bg-white/92 px-6 py-16 text-center text-sm font-semibold text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/92 dark:text-white/65'>
              Carregando perfil público...
            </div>
          )}

          {!isLoading && error && (
            <div className='rounded-3xl border border-red-200 bg-red-50 px-6 py-5 text-sm font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100'>
              {error}
            </div>
          )}

          {!isLoading && !error && profile && user && relationship && (
            <>
              <motion.section
                variants={fadeUp}
                initial='hidden'
                animate='visible'
                className='rounded-[34px] border border-reuseai-verde/10 bg-white/92 p-6 shadow-[0_40px_100px_-60px_rgba(28,28,37,0.45)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/92 md:p-8'
              >
                <div className='flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between'>
                  <div className='flex flex-col gap-5 md:flex-row md:items-center'>
                    <img
                      src={getUserAvatarUrl(user)}
                      alt={user.username}
                      className='h-24 w-24 rounded-full border border-reuseai-verde/15 object-cover md:h-28 md:w-28'
                    />

                    <div>
                      <p className='text-xs font-semibold uppercase tracking-[0.26em] text-reuseai-verde'>
                        Perfil público
                      </p>
                      <h1 className='mt-3 text-4xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                        @{user.username}
                      </h1>
                      {showFullName && (
                        <p className='mt-2 text-base text-reuseai-cinza dark:text-white/65'>
                          {user.full_name}
                        </p>
                      )}
                      <p className='mt-3 text-sm text-reuseai-cinza dark:text-white/65'>
                        Nível {user.game_profile.level} •{' '}
                        {user.game_profile.level_title}
                      </p>
                    </div>
                  </div>

                  <div className='flex flex-col gap-3 sm:flex-row lg:flex-col'>
                    {relationship.status === 'self' && (
                      <a
                        href='/profile'
                        className='inline-flex items-center justify-center gap-2 rounded-full bg-reuseai-verde px-5 py-3 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul'
                      >
                        Ver meu perfil
                      </a>
                    )}

                    {relationship.status === 'none' && (
                      <button
                        type='button'
                        disabled={busyAction === 'add-friend'}
                        onClick={() => void handleAddFriend()}
                        className='inline-flex items-center justify-center gap-2 rounded-full bg-reuseai-verde px-5 py-3 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
                      >
                        <FontAwesomeIcon icon={faUserPlus} />
                        Adicionar amigo
                      </button>
                    )}

                    {relationship.status === 'incoming_request' && (
                      <button
                        type='button'
                        disabled={busyAction === 'accept-friend'}
                        onClick={() => void handleAcceptRequest()}
                        className='inline-flex items-center justify-center gap-2 rounded-full bg-reuseai-verde px-5 py-3 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
                      >
                        <FontAwesomeIcon icon={faUserCheck} />
                        Aceitar amizade
                      </button>
                    )}

                    {relationship.status === 'outgoing_request' && (
                      <span className='inline-flex items-center justify-center gap-2 rounded-full border border-reuseai-verde/15 bg-reuseai-verde/5 px-5 py-3 text-sm font-semibold text-reuseai-preto dark:border-reuseai-verdeNeon/15 dark:bg-[#0f1813] dark:text-reuseai-branco'>
                        Pedido pendente
                      </span>
                    )}

                    {relationship.status === 'friends' && (
                      <>
                        <span className='inline-flex items-center justify-center gap-2 rounded-full border border-reuseai-verde/15 bg-reuseai-verde/5 px-5 py-3 text-sm font-semibold text-reuseai-preto dark:border-reuseai-verdeNeon/15 dark:bg-[#0f1813] dark:text-reuseai-branco'>
                          <FontAwesomeIcon icon={faUserCheck} />
                          Amigos conectados
                        </span>
                        <button
                          type='button'
                          disabled={busyAction === 'create-battle'}
                          onClick={() => void handleCreateBattle()}
                          className='inline-flex items-center justify-center gap-2 rounded-full border border-reuseai-verde/15 bg-white px-5 py-3 text-sm font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-reuseai-verdeNeon/15 dark:bg-[#132017] dark:text-reuseai-branco'
                        >
                          <FontAwesomeIcon icon={faBolt} />
                          Pedir batalha
                        </button>
                      </>
                    )}

                    {relationship.status === 'anonymous' && (
                      <a
                        href={`/login?next=/usuarios/${username}`}
                        className='inline-flex items-center justify-center gap-2 rounded-full bg-reuseai-verde px-5 py-3 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul'
                      >
                        Entrar para se conectar
                      </a>
                    )}
                  </div>
                </div>
              </motion.section>

              <motion.section
                variants={staggerContainer}
                initial='hidden'
                animate='visible'
                className='mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4'
              >
                {[
                  {
                    icon: faBolt,
                    label: 'XP total',
                    value: formatNumber(user.game_profile.xp_total),
                  },
                  {
                    icon: faRecycle,
                    label: 'Análises',
                    value: formatNumber(user.game_profile.total_analyses),
                  },
                  {
                    icon: faLeaf,
                    label: 'Sequência',
                    value: formatNumber(user.game_profile.current_streak),
                  },
                  {
                    icon: faMedal,
                    label: 'Vitórias',
                    value: formatNumber(profile.social.battles_won),
                  },
                ].map(stat => (
                  <motion.div
                    key={stat.label}
                    variants={staggerItem}
                    className='rounded-3xl border border-reuseai-verde/10 bg-white/90 p-5 shadow-[0_24px_60px_-48px_rgba(28,28,37,0.4)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/90'
                  >
                    <p className='flex items-center gap-2 text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                      <FontAwesomeIcon icon={stat.icon} className='text-reuseai-verde' />
                      {stat.label}
                    </p>
                    <p className='mt-3 text-3xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                      {stat.value}
                    </p>
                  </motion.div>
                ))}
              </motion.section>

              <motion.section
                variants={fadeUp}
                initial='hidden'
                animate='visible'
                className='mt-8 rounded-[34px] border border-reuseai-verde/10 bg-white/92 p-6 shadow-[0_40px_100px_-60px_rgba(28,28,37,0.45)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/92 md:p-8'
              >
                <div className='grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]'>
                  <div>
                    <p className='text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
                      Conexão
                    </p>
                    <h2 className='mt-2 text-2xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                      Uma página pensada para interação entre usuários
                    </h2>
                    <p className='mt-4 text-sm leading-7 text-reuseai-cinza dark:text-white/70'>
                      Este perfil público destaca o impacto da pessoa dentro da
                      plataforma e facilita amizade, visitas e batalhas
                      sustentáveis sem misturar com a edição do seu perfil
                      pessoal.
                    </p>
                  </div>

                  <div className='grid gap-4'>
                    <div className='rounded-3xl border border-reuseai-verde/10 bg-reuseai-verde/5 p-5 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'>
                      <p className='text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                        Amigos conectados
                      </p>
                      <p className='mt-3 text-3xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                        {formatNumber(profile.social.friends_count)}
                      </p>
                    </div>
                    <div className='rounded-3xl border border-reuseai-verde/10 bg-reuseai-verde/5 p-5 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'>
                      <p className='text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                        Batalhas jogadas
                      </p>
                      <p className='mt-3 text-3xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                        {formatNumber(profile.social.battles_played)}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.section>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
