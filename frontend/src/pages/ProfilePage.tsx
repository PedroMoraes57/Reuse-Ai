import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRotateLeft,
  faBolt,
  faCamera,
  faCheck,
  faCircleCheck,
  faEnvelope,
  faLeaf,
  faMedal,
  faPen,
  faRecycle,
  faRightFromBracket,
  faUserGroup,
  faUser,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { motion, AnimatePresence } from 'framer-motion';
import { me, logout, updateDisplayName, updateAvatar, revertAvatar } from '../services/AuthApi';
import type { UserInfo } from '../services/AuthApi';
import { getUserAvatarUrl, getUserDisplayName } from '../utils/user';
import Navbar from '../components/LandingPage/Navbar';
import Footer from '../components/LandingPage/Footer';
import {
  fetchGameOverview,
  type GameOverview,
} from '../services/GamificationApi';
import {
  fadeUp,
  staggerContainer,
  staggerItem,
} from '../utils/animations';
import { dispatchUserCleared, dispatchUserUpdated } from '../utils/userSync';

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value);
}

function cooldownLabel(updatedAt: string | null | undefined): string | null {
  if (!updatedAt) return null;
  const elapsed = Date.now() - new Date(updatedAt).getTime();
  const cooldownMs = 72 * 60 * 60 * 1000;
  const remaining = cooldownMs - elapsed;
  if (remaining <= 0) return null;
  const h = Math.floor(remaining / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [overview, setOverview] = useState<GameOverview | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    me()
      .then(currentUser => {
        setUser(currentUser);
        dispatchUserUpdated(currentUser);
        fetchGameOverview().then(setOverview).catch(() => {
          setOverview(null);
        });
      })
      .catch(() => {
        localStorage.removeItem('authToken');
        window.location.href = '/login?next=/profile';
      });
  }, []);

  function handleLogout() {
    logout().finally(() => {
      dispatchUserCleared();
      window.location.href = '/';
    });
  }

  function startEditing() {
    setNameInput(user ? user.username : '');
    setNameError(null);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }

  function cancelEditing() {
    setEditingName(false);
    setNameError(null);
  }

  async function saveName() {
    if (!nameInput.trim()) return;
    setNameSaving(true);
    setNameError(null);
    try {
      const updated = await updateDisplayName(nameInput.trim());
      setUser(prev => {
        if (!prev) return prev;
        const nextUser = { ...prev, ...updated };
        dispatchUserUpdated(nextUser);
        return nextUser;
      });
      setEditingName(false);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Não foi possível salvar o nome.');
    } finally {
      setNameSaving(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarLoading(true);
    setAvatarError(null);
    try {
      const updated = await updateAvatar(file);
      setUser(prev => {
        if (!prev) return prev;
        const nextUser = { ...prev, ...updated };
        dispatchUserUpdated(nextUser);
        return nextUser;
      });
      setShowAvatarModal(false);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Não foi possível trocar a foto.');
    } finally {
      setAvatarLoading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  async function handleAvatarRevert() {
    setAvatarLoading(true);
    setAvatarError(null);
    try {
      const updated = await revertAvatar();
      setUser(prev => {
        if (!prev) return prev;
        const nextUser = { ...prev, ...updated };
        dispatchUserUpdated(nextUser);
        return nextUser;
      });
      setShowAvatarModal(false);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Não foi possível restaurar a foto anterior.');
    } finally {
      setAvatarLoading(false);
    }
  }

  if (!user) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-reuseai-branco text-reuseai-preto dark:bg-[#0b100d] dark:text-reuseai-branco'>
        Carregando...
      </div>
    );
  }

  const gameProfile = overview?.me?.profile ?? user.game_profile;
  const missions = overview?.me?.missions ?? [];
  const recentEvents = overview?.me?.recent_events ?? [];

  return (
    <>
      <Navbar isStatic forceScrolled />
      <main className='min-h-screen bg-gradient-to-b from-reuseai-branco via-reuseai-branco to-reuseai-verdeClaro/10 px-4 py-10 dark:from-[#09100b] dark:via-[#0b100d] dark:to-[#122018] md:px-6 md:py-16'>
        <motion.div
          variants={fadeUp}
          initial='hidden'
          animate='visible'
          className='mx-auto max-w-5xl rounded-[32px] border border-reuseai-verde/10 bg-white/92 p-5 shadow-[0_40px_90px_-60px_rgba(28,28,37,0.45)] backdrop-blur-xl dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/92 md:p-9'
        >
          {/* Header */}
          <motion.div
            variants={staggerContainer}
            initial='hidden'
            animate='visible'
            className='flex flex-col gap-6 md:flex-row md:items-center md:justify-between'
          >
            <motion.div variants={staggerItem} className='flex items-center gap-4'>
              <motion.button
                type='button'
                onClick={() => setShowAvatarModal(true)}
                className='group relative h-16 w-16 flex-shrink-0 cursor-pointer md:h-24 md:w-24'
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                title='Editar foto de perfil'
              >
                <img
                  src={getUserAvatarUrl(user)}
                  alt={getUserDisplayName(user)}
                  className='h-full w-full rounded-full border border-reuseai-verde/15 object-cover'
                />
                <span className='absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100'>
                  <FontAwesomeIcon icon={faCamera} className='text-lg text-white' />
                </span>
              </motion.button>
              <div>
                <p className='text-xs font-semibold uppercase tracking-[0.26em] text-reuseai-verde'>
                  Perfil
                </p>

                <h1 className='mt-2 text-3xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                  {getUserDisplayName(user)}
                </h1>

                <p className='mt-2 text-sm text-reuseai-cinza dark:text-white/65'>
                  @{user.username}
                </p>
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className='flex flex-col gap-3 sm:flex-row'>
              <a
                href='/ranking'
                className='inline-flex items-center justify-center gap-2 rounded-full border border-reuseai-verde/15 bg-reuseai-verde/5 px-5 py-3 text-sm font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/10 dark:border-reuseai-verdeNeon/15 dark:bg-[#0f1813] dark:text-reuseai-branco'
              >
                <FontAwesomeIcon icon={faMedal} />
                Ver ranking
              </a>

              <a
                href='/amigos'
                className='inline-flex items-center justify-center gap-2 rounded-full border border-reuseai-verde/15 bg-reuseai-verde/5 px-5 py-3 text-sm font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/10 dark:border-reuseai-verdeNeon/15 dark:bg-[#0f1813] dark:text-reuseai-branco'
              >
                <FontAwesomeIcon icon={faUserGroup} />
                Ver amigos
              </a>

              <button
                onClick={handleLogout}
                className='inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/15'
              >
                <FontAwesomeIcon icon={faRightFromBracket} />
                Sair
              </button>
            </motion.div>
          </motion.div>

          {/* Info grid */}
          <motion.div
            variants={staggerContainer}
            initial='hidden'
            whileInView='visible'
            viewport={{ once: true, margin: '-40px' }}
            className='mt-8 grid gap-4 md:grid-cols-2'
          >
            {/* Username card — editável */}
            <motion.div
              variants={staggerItem}
              className='rounded-2xl border border-reuseai-verde/10 bg-reuseai-verde/5 p-5 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'
            >
              <div className='flex min-h-[2.5rem] items-center justify-between gap-3'>
                <p className='flex items-center gap-2 text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                  <FontAwesomeIcon icon={faUser} className='text-reuseai-verde' />
                  Nome de usuário
                </p>
                {!editingName && (
                  cooldownLabel(user.display_name_updated_at) === null ? (
                    <button
                      type='button'
                      onClick={startEditing}
                      title='Editar nome de usuário'
                      className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-reuseai-verde/15 bg-white text-sm text-reuseai-cinza transition-colors hover:border-reuseai-verde/30 hover:bg-reuseai-verde/5 hover:text-reuseai-verde dark:border-reuseai-verdeNeon/15 dark:bg-[#101915] dark:hover:bg-[#162019] dark:hover:text-reuseai-verdeNeon'
                    >
                      <FontAwesomeIcon icon={faPen} />
                    </button>
                  ) : (
                    <span
                      title={`Disponível em ${cooldownLabel(user.display_name_updated_at)}`}
                      className='flex h-8 cursor-default items-center rounded-full border border-reuseai-verde/10 bg-white/60 px-3 text-xs font-semibold text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#101915] dark:text-white/55'
                    >
                      Disponível em {cooldownLabel(user.display_name_updated_at)}
                    </span>
                  )
                )}
              </div>

              <AnimatePresence mode='wait'>
                {editingName ? (
                  <motion.div
                    key='editing'
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className='mt-3'
                  >
                    <input
                      ref={nameInputRef}
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void saveName();
                        if (e.key === 'Escape') cancelEditing();
                      }}
                      maxLength={150}
                      placeholder='Novo nome de usuário'
                      className='block w-full rounded-xl border border-reuseai-verde/20 bg-reuseai-branco px-3 py-2 text-base text-reuseai-preto outline-none transition-all focus:border-reuseai-verde focus:ring-2 focus:ring-reuseai-verde/15 dark:border-reuseai-verdeNeon/20 dark:bg-[#111a14] dark:text-reuseai-branco dark:focus:border-reuseai-verdeNeon'
                    />
                    {nameError && (
                      <p className='mt-2 text-xs font-medium text-red-600 dark:text-red-400'>
                        {nameError}
                      </p>
                    )}
                    <div className='mt-3 flex gap-2'>
                      <button
                        type='button'
                        onClick={() => void saveName()}
                        disabled={nameSaving || !nameInput.trim()}
                        className='inline-flex items-center gap-2 rounded-full bg-reuseai-verde px-4 py-2 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
                      >
                        <FontAwesomeIcon icon={faCheck} />
                        {nameSaving ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button
                        type='button'
                        onClick={cancelEditing}
                        disabled={nameSaving}
                        className='inline-flex items-center gap-2 rounded-full border border-reuseai-verde/15 bg-white px-4 py-2 text-sm font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/5 dark:border-reuseai-verdeNeon/15 dark:bg-[#101915] dark:text-reuseai-branco'
                      >
                        <FontAwesomeIcon icon={faXmark} />
                        Cancelar
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.p
                    key='value'
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className='mt-3 text-base text-reuseai-cinza dark:text-white/70'
                  >
                    {user.username}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>

            {[
              { icon: faEnvelope, label: 'E-mail', value: user.email || '-' },
              {
                icon: faCircleCheck,
                label: 'Status do e-mail',
                value: user.email_verified ? 'Confirmado' : 'Pendente de confirmação',
              },
              {
                icon: null,
                label: 'Conta pronta para análise',
                value: user.email_verified
                  ? 'Sua conta está habilitada para usar o classificador normalmente.'
                  : 'Confirme o e-mail antes de usar todas as funcionalidades.',
              },
            ].map(item => (
              <motion.div
                key={item.label}
                variants={staggerItem}
                className='rounded-2xl border border-reuseai-verde/10 bg-reuseai-verde/5 p-5 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'
              >
                <p className='flex items-center gap-2 text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                  {item.icon && <FontAwesomeIcon icon={item.icon} className='text-reuseai-verde' />}
                  {item.label}
                </p>
                <p className='mt-3 text-base text-reuseai-cinza dark:text-white/70'>
                  {item.value}
                </p>
              </motion.div>
            ))}
          </motion.div>

          {/* Game progress */}
          {gameProfile && (
            <>
              <motion.div
                variants={fadeUp}
                initial='hidden'
                whileInView='visible'
                viewport={{ once: true, margin: '-40px' }}
                className='mt-10 flex items-center justify-between gap-4 border-t border-reuseai-verde/10 pt-8'
              >
                <div>
                  <p className='text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
                    Jornada do usuário
                  </p>
                  <h2 className='mt-2 text-2xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                    Seu progresso na Reuse.AI
                  </h2>
                </div>
                <span className='rounded-full bg-reuseai-verde px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-reuseai-branco'>
                  {gameProfile.level_title}
                </span>
              </motion.div>

              <motion.div
                variants={staggerContainer}
                initial='hidden'
                whileInView='visible'
                viewport={{ once: true, margin: '-40px' }}
                className='mt-6 grid grid-cols-2 gap-4 md:grid-cols-4'
              >
                {[
                  { icon: faBolt, label: 'XP total', value: formatNumber(gameProfile.xp_total) },
                  { icon: faMedal, label: 'Nível', value: gameProfile.level },
                  { icon: faLeaf, label: 'Sequência', value: formatNumber(gameProfile.current_streak) },
                  { icon: faRecycle, label: 'Análises', value: formatNumber(gameProfile.total_analyses) },
                ].map(stat => (
                  <motion.div
                    key={stat.label}
                    variants={staggerItem}
                    whileHover={{ y: -3, transition: { duration: 0.2 } }}
                    className='rounded-2xl border border-reuseai-verde/10 bg-reuseai-verde/5 p-5 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'
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
              </motion.div>

              <motion.div
                variants={fadeUp}
                initial='hidden'
                whileInView='visible'
                viewport={{ once: true, margin: '-40px' }}
                className='mt-6 rounded-[28px] border border-reuseai-verde/10 bg-white/80 p-6 dark:border-reuseai-verdeNeon/10 dark:bg-[#0d1510]'
              >
                <div className='mb-3 flex items-center justify-between gap-3 text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                  <span>Progresso para o próximo nível</span>
                  <span>{gameProfile.progress_percent}%</span>
                </div>
                <div className='h-3 overflow-hidden rounded-full bg-reuseai-verde/10'>
                  <motion.div
                    className='h-full rounded-full bg-gradient-to-r from-reuseai-verde to-reuseai-azul'
                    initial={{ width: 0 }}
                    whileInView={{ width: `${gameProfile.progress_percent}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                  />
                </div>
                <div className='mt-4 flex flex-col gap-2 text-sm text-reuseai-cinza dark:text-white/70 md:flex-row md:items-center md:justify-between'>
                  <span>
                    {formatNumber(gameProfile.progress_to_next_level)} XP já
                    acumulados neste nível
                  </span>
                  <span>
                    Faltam {formatNumber(gameProfile.xp_to_next_level)} XP para
                    subir
                  </span>
                </div>
              </motion.div>
            </>
          )}

          {/* Missions + Events */}
          {(missions.length > 0 || recentEvents.length > 0) && (
            <div className='mt-10 grid gap-6 border-t border-reuseai-verde/10 pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
              <motion.div
                variants={fadeUp}
                initial='hidden'
                whileInView='visible'
                viewport={{ once: true, margin: '-40px' }}
                className='rounded-[28px] border border-reuseai-verde/10 bg-white/80 p-6 dark:border-reuseai-verdeNeon/10 dark:bg-[#0d1510]'
              >
                <p className='text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
                  Missões
                </p>
                <h2 className='mt-2 text-2xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                  Metas da semana
                </h2>
                <div
                  className='mt-5 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-reuseai-verde/5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-reuseai-verde/30 hover:[&::-webkit-scrollbar-thumb]:bg-reuseai-verde/50'
                  style={{ maxHeight: missions.length > 2 ? '32rem' : undefined }}
                >
                <motion.div
                  className='space-y-4'
                  variants={staggerContainer}
                  initial='hidden'
                  whileInView='visible'
                  viewport={{ once: true, margin: '-40px' }}
                >
                  {missions.map(mission => {
                    const progress =
                      mission.target > 0 && typeof mission.progress === 'number'
                        ? Math.min((mission.progress / mission.target) * 100, 100)
                        : 0;

                    return (
                      <motion.div
                        key={mission.key}
                        variants={staggerItem}
                        className='rounded-2xl border border-reuseai-verde/10 bg-reuseai-verde/5 p-4 dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]'
                      >
                        <div className='flex items-start justify-between gap-3'>
                          <p className='text-sm font-bold text-reuseai-preto dark:text-reuseai-branco'>
                            {mission.title}
                          </p>
                          <span className='whitespace-nowrap rounded-full bg-reuseai-verde px-3 py-1 text-xs font-bold text-reuseai-branco'>
                            +{mission.xp_reward} XP
                          </span>
                        </div>
                        <p className='mt-2 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
                          {mission.description}
                        </p>

                        <div className='mt-4 flex items-center justify-between text-xs font-semibold text-reuseai-cinza dark:text-white/65'>
                          <span>
                            {mission.progress}/{mission.target}
                          </span>
                          <span>
                            {mission.claimed
                              ? 'Concluída'
                              : mission.completed
                                ? 'Pronta para pontuar'
                                : 'Em andamento'}
                          </span>
                        </div>
                        <div className='mt-2 h-2 overflow-hidden rounded-full bg-reuseai-verde/10'>
                          <motion.div
                            className='h-full rounded-full bg-reuseai-verde'
                            initial={{ width: 0 }}
                            whileInView={{ width: `${progress}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
                </div>
              </motion.div>

              <motion.div
                variants={fadeUp}
                initial='hidden'
                whileInView='visible'
                viewport={{ once: true, margin: '-40px' }}
                className='rounded-[28px] border border-reuseai-verde/10 bg-white/80 p-6 dark:border-reuseai-verdeNeon/10 dark:bg-[#0d1510]'
              >
                <p className='text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
                  Atividade recente
                </p>
                <h2 className='mt-2 text-2xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                  Últimos ganhos de XP
                </h2>
                <motion.div
                  className='mt-5 space-y-3'
                  variants={staggerContainer}
                  initial='hidden'
                  whileInView='visible'
                  viewport={{ once: true, margin: '-40px' }}
                >
                  {recentEvents.map(event => (
                    <motion.div
                      key={event.id}
                      variants={staggerItem}
                      className='flex items-center justify-between gap-4 rounded-2xl border border-reuseai-verde/10 bg-reuseai-verde/5 px-4 py-3 dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]'
                    >
                      <div className='min-w-0'>
                        <p className='truncate text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                          {event.title}
                        </p>
                        <p className='mt-1 text-xs text-reuseai-cinza dark:text-white/60'>
                          {new Intl.DateTimeFormat('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          }).format(new Date(event.created_at))}
                        </p>
                      </div>
                      <span className='whitespace-nowrap rounded-full bg-reuseai-verde px-3 py-1 text-xs font-bold text-reuseai-branco'>
                        +{event.amount} XP
                      </span>
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            </div>
          )}
        </motion.div>
      </main>
      <div id='contato'>
        <Footer />
      </div>

      {/* Hidden file input */}
      <input
        ref={avatarInputRef}
        type='file'
        accept='image/*'
        className='hidden'
        onChange={e => void handleAvatarUpload(e)}
      />

      {/* Avatar edit modal */}
      <AnimatePresence>
        {showAvatarModal && (
          <motion.div
            className='fixed inset-0 z-50 flex items-center justify-center p-4'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div
              className='absolute inset-0 bg-black/50 backdrop-blur-sm'
              onClick={() => { setShowAvatarModal(false); setAvatarError(null); }}
            />
            <motion.div
              className='relative z-10 w-full max-w-sm rounded-[28px] border border-reuseai-verde/15 bg-white p-6 shadow-2xl dark:border-reuseai-verdeNeon/15 dark:bg-[#101915]'
              initial={{ scale: 0.95, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 12 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className='mb-5 flex items-center justify-between'>
                <h3 className='text-lg font-black text-reuseai-preto dark:text-reuseai-branco'>
                  Foto de perfil
                </h3>
                <button
                  type='button'
                  onClick={() => { setShowAvatarModal(false); setAvatarError(null); }}
                  className='flex h-8 w-8 items-center justify-center rounded-full border border-reuseai-verde/10 text-reuseai-cinza transition-colors hover:bg-reuseai-verde/5 dark:border-reuseai-verdeNeon/10 dark:text-white/60'
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>

              <div className='mb-5 flex justify-center'>
                <img
                  src={getUserAvatarUrl(user)}
                  alt='Foto atual'
                  className='h-24 w-24 rounded-full border-2 border-reuseai-verde/20 object-cover'
                />
              </div>

              {avatarError && (
                <p className='mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400'>
                  {avatarError}
                </p>
              )}

              <button
                type='button'
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarLoading}
                className='flex w-full items-center justify-center gap-2 rounded-full bg-reuseai-verde px-4 py-3 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
              >
                <FontAwesomeIcon icon={faCamera} />
                {avatarLoading ? 'Enviando...' : 'Trocar foto'}
              </button>

              {user.avatar_backup_url && (
                <div className='mt-4 border-t border-reuseai-verde/10 pt-4'>
                  <p className='mb-3 text-xs font-semibold text-reuseai-cinza dark:text-white/55'>
                    Foto anterior (backup)
                  </p>
                  <div className='flex items-center gap-3'>
                    <img
                      src={user.avatar_backup_url}
                      alt='Foto anterior'
                      className='h-12 w-12 flex-shrink-0 rounded-full border border-reuseai-verde/15 object-cover'
                    />
                    <button
                      type='button'
                      onClick={() => void handleAvatarRevert()}
                      disabled={avatarLoading}
                      className='flex flex-1 items-center justify-center gap-2 rounded-full border border-reuseai-verde/15 bg-reuseai-verde/5 px-4 py-2 text-sm font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-reuseai-verdeNeon/15 dark:bg-[#0f1813] dark:text-reuseai-branco'
                    >
                      <FontAwesomeIcon icon={faArrowRotateLeft} />
                      Usar anterior
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
