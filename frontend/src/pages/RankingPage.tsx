import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBolt,
  faChartColumn,
  faCircleCheck,
  faLeaf,
  faMedal,
  faRecycle,
  faTrophy,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { motion } from 'framer-motion';
import Navbar from '../components/LandingPage/Navbar';
import Footer from '../components/LandingPage/Footer';
import {
  fetchGameOverview,
  type GameMission,
  type GameOverview,
} from '../services/GamificationApi';
import { getUserAvatarUrl } from '../utils/user';
import {
  fadeUp,
  scalePop,
  staggerContainer,
  staggerItem,
} from '../utils/animations';

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value);
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDateRange(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  });

  return `${formatter.format(parseLocalDate(start))} - ${formatter.format(parseLocalDate(end))}`;
}

const SPARKLE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function AllMissionsDoneCard() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
      className='relative mt-6 overflow-hidden rounded-3xl border border-reuseai-verde/20 bg-gradient-to-br from-reuseai-verde/15 via-white to-reuseai-azulClaro/15 p-7 text-center dark:border-reuseai-verdeNeon/20 dark:from-reuseai-verde/10 dark:via-[#101915] dark:to-reuseai-azulClaro/10'
    >
      {SPARKLE_ANGLES.map((angleDeg, i) => {
        const rad = (angleDeg * Math.PI) / 180;
        return (
          <motion.span
            key={angleDeg}
            className='pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-reuseai-verde'
            style={{ marginLeft: -4, marginTop: -4 }}
            initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1.2, 0],
              x: Math.cos(rad) * 64,
              y: Math.sin(rad) * 64,
            }}
            transition={{ duration: 1.1, delay: i * 0.06, ease: 'easeOut' }}
          />
        );
      })}

      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.45, delay: 0.12, ease: [0.34, 1.56, 0.64, 1] }}
        className='mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-reuseai-verde text-xl text-reuseai-branco shadow-[0_8px_24px_-8px_rgba(120,216,78,0.55)]'
      >
        <FontAwesomeIcon icon={faCircleCheck} />
      </motion.div>

      <motion.h3
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className='text-lg font-black text-reuseai-preto dark:text-reuseai-branco'
      >
        Semana perfeita!
      </motion.h3>
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        className='mt-2 text-sm leading-6 text-reuseai-cinza dark:text-white/70'
      >
        Você concluiu todas as missões desta semana. Novas missões chegam na segunda-feira.
      </motion.p>
    </motion.div>
  );
}

function MissionCard({
  mission,
  compact = false,
}: {
  mission: GameMission;
  compact?: boolean;
}) {
  const progress =
    typeof mission.progress === 'number' && mission.target > 0
      ? Math.min((mission.progress / mission.target) * 100, 100)
      : 0;

  return (
    <motion.div
      variants={staggerItem}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className='rounded-3xl border border-reuseai-verde/10 bg-white/90 p-5 shadow-[0_24px_60px_-48px_rgba(28,28,37,0.4)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/90'
    >
      <div className='flex items-start justify-between gap-3'>
        <div>
          <p className='text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
            Missão
          </p>
          <h3 className='mt-2 text-lg font-black text-reuseai-preto dark:text-reuseai-branco'>
            {mission.title}
          </h3>
        </div>
        <span className='whitespace-nowrap rounded-full bg-reuseai-verde px-3 py-1 text-xs font-bold text-reuseai-branco'>
          +{mission.xp_reward} XP
        </span>
      </div>

      <p className='mt-3 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
        {mission.description}
      </p>

      {typeof mission.progress === 'number' && (
        <div className='mt-4'>
          <div className='mb-2 flex items-center justify-between text-xs font-semibold text-reuseai-cinza dark:text-white/65'>
            <span>
              {mission.progress}/{mission.target}
            </span>
            <span>
              {mission.claimed
                ? 'Recompensa resgatada'
                : mission.completed
                  ? 'Concluída'
                  : 'Em andamento'}
            </span>
          </div>
          <div className='h-2 overflow-hidden rounded-full bg-reuseai-verde/10'>
            <motion.div
              className='h-full rounded-full bg-reuseai-verde'
              initial={{ width: 0 }}
              whileInView={{ width: `${progress}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            />
          </div>
        </div>
      )}

      {compact && mission.completed && (
        <div className='mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100'>
          <FontAwesomeIcon icon={faCircleCheck} />
          Meta concluída
        </div>
      )}
    </motion.div>
  );
}

export default function RankingPage() {
  const [overview, setOverview] = useState<GameOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGameOverview()
      .then(setOverview)
      .catch(err => {
        setError(
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar a central de ranking agora.',
        );
      })
      .finally(() => setIsLoading(false));
  }, []);

  const me = overview?.me;

  return (
    <>
      <Navbar isStatic forceScrolled />
      <main className='min-h-screen bg-gradient-to-b from-reuseai-branco via-reuseai-branco to-reuseai-verdeClaro/10 dark:from-[#09100b] dark:via-[#0b100d] dark:to-[#122018]'>
        {/* ── Hero ── */}
        <section className='relative overflow-hidden px-6 py-16'>
          <div className='absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(120,216,78,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(56,182,255,0.14),transparent_34%)]' />
          <div className='absolute left-[-4rem] top-16 h-52 w-52 rounded-full bg-reuseai-verdeClaro/20 blur-3xl' />
          <div className='absolute right-[-5rem] bottom-6 h-64 w-64 rounded-full bg-reuseai-azulClaro/12 blur-3xl' />

          <div className='relative mx-auto max-w-6xl'>
            <div className='grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-center'>
              {/* Left copy */}
              <motion.div
                className='max-w-2xl'
                variants={staggerContainer}
                initial='hidden'
                animate='visible'
              >
                <motion.span
                  variants={scalePop}
                  className='inline-flex items-center gap-2 rounded-full border border-reuseai-verde/15 bg-white/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-reuseai-verde shadow-sm backdrop-blur-sm dark:border-reuseai-verdeNeon/15 dark:bg-[#101915]/85 dark:text-reuseai-verdeNeon'
                >
                  <FontAwesomeIcon icon={faTrophy} />
                  Ranking Circular
                </motion.span>

                <motion.h1
                  variants={fadeUp}
                  className='mt-6 text-4xl font-black leading-tight text-reuseai-preto dark:text-reuseai-branco md:text-6xl'
                >
                  Progresso, missões e impacto em uma só jornada.
                </motion.h1>

                <motion.p
                  variants={fadeUp}
                  className='mt-5 max-w-xl text-base leading-7 text-reuseai-cinza dark:text-white/70 md:text-lg'
                >
                  Cada análise concluída agora vale experiência. Você evolui no
                  uso da plataforma, entra no ranking semanal e ainda pode ganhar
                  XP extra com um quiz leve sobre o item recém-analisado.
                </motion.p>

                {overview && (
                  <motion.div
                    variants={staggerContainer}
                    className='mt-8 grid gap-4 sm:grid-cols-3'
                  >
                    {[
                      { label: 'Comunidade', value: formatNumber(overview.community.players), sub: 'participantes ativos' },
                      { label: 'XP acumulado', value: formatNumber(overview.community.total_xp), sub: 'pontos gerados na plataforma' },
                      {
                        label: 'Semana atual',
                        value: formatDateRange(overview.period.week_start, overview.period.week_end),
                        sub: 'ranking semanal em andamento',
                        small: true,
                      },
                    ].map(stat => (
                      <motion.div
                        key={stat.label}
                        variants={staggerItem}
                        whileHover={{ y: -3, transition: { duration: 0.2 } }}
                        className='rounded-3xl border border-reuseai-verde/10 bg-white/85 p-5 shadow-[0_24px_60px_-48px_rgba(28,28,37,0.45)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/85'
                      >
                        <p className='text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
                          {stat.label}
                        </p>
                        <p className={`mt-3 font-black text-reuseai-preto dark:text-reuseai-branco ${stat.small ? 'text-xl' : 'text-3xl'}`}>
                          {stat.value}
                        </p>
                        <p className='mt-2 text-sm text-reuseai-cinza dark:text-white/65'>
                          {stat.sub}
                        </p>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </motion.div>

              {/* Right: user card */}
              <motion.div
                variants={fadeUp}
                initial='hidden'
                animate='visible'
                transition={{ delay: 0.15 }}
                className='rounded-[36px] border border-reuseai-verde/10 bg-white/90 p-6 shadow-[0_40px_90px_-60px_rgba(28,28,37,0.45)] backdrop-blur-xl dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/90'
              >
                {me ? (
                  <>
                    <div className='flex items-center gap-4'>
                        <motion.img
                          src={getUserAvatarUrl({ avatar_url: me.avatar_url })}
                          alt={me.username}
                          className='h-16 w-16 rounded-full border border-reuseai-verde/15 object-cover'
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                      />
                      <div>
                        <p className='text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
                          Seu progresso
                        </p>
                        <a
                          href={`/usuarios/${me.username}`}
                          className='mt-2 inline-block text-2xl font-black text-reuseai-preto transition-colors hover:text-reuseai-verde dark:text-reuseai-branco'
                        >
                          @{me.username}
                        </a>
                        <p className='mt-1 text-sm text-reuseai-cinza dark:text-white/65'>
                          {me.profile.level_title}
                        </p>
                      </div>
                    </div>

                    <motion.div
                      className='mt-6 grid gap-4 sm:grid-cols-2'
                      variants={staggerContainer}
                      initial='hidden'
                      animate='visible'
                    >
                      {[
                        { icon: faBolt, label: 'XP total', value: formatNumber(me.profile.xp_total) },
                        { icon: faMedal, label: 'Posição semanal', value: me.rank ? `#${me.rank}` : '-' },
                        { icon: faLeaf, label: 'Materiais descobertos', value: formatNumber(me.profile.unique_materials) },
                        { icon: faRecycle, label: 'Análises concluídas', value: formatNumber(me.profile.total_analyses) },
                      ].map(stat => (
                        <motion.div
                          key={stat.label}
                          variants={staggerItem}
                          className='rounded-3xl border border-reuseai-verde/10 bg-reuseai-verde/5 p-5 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'
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

                    <div className='mt-6'>
                      <div className='mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.22em] text-reuseai-cinza dark:text-white/65'>
                        <span>Nível {me.profile.level}</span>
                        <span>{me.profile.progress_percent}%</span>
                      </div>
                      <div className='h-3 overflow-hidden rounded-full bg-reuseai-verde/10'>
                        <motion.div
                          className='h-full rounded-full bg-gradient-to-r from-reuseai-verde to-reuseai-azul'
                          initial={{ width: 0 }}
                          animate={{ width: `${me.profile.progress_percent}%` }}
                          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
                        />
                      </div>
                      <p className='mt-3 text-sm text-reuseai-cinza dark:text-white/70'>
                        Faltam {formatNumber(me.profile.xp_to_next_level)} XP
                        para o próximo nível.
                      </p>
                    </div>
                  </>
                ) : (
                  <motion.div
                    variants={staggerContainer}
                    initial='hidden'
                    animate='visible'
                  >
                    <motion.p
                      variants={scalePop}
                      className='inline-flex items-center gap-2 rounded-full bg-reuseai-verde/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-verde'
                    >
                      <FontAwesomeIcon icon={faLeaf} />
                      Entre na disputa
                    </motion.p>
                    <motion.h2
                      variants={fadeUp}
                      className='mt-5 text-3xl font-black leading-tight text-reuseai-preto dark:text-reuseai-branco'
                    >
                      Crie sua conta para aparecer no ranking e acompanhar seu
                      progresso.
                    </motion.h2>
                    <motion.p
                      variants={fadeUp}
                      className='mt-4 text-sm leading-7 text-reuseai-cinza dark:text-white/70'
                    >
                      Cada análise vale XP, desbloqueia missões semanais e abre
                      espaço para ganhar bônus extras com o quiz pós-análise.
                    </motion.p>
                    <motion.div
                      variants={fadeUp}
                      className='mt-6 flex flex-col gap-3 sm:flex-row'
                    >
                      <a
                        href='/cadastro'
                        className='inline-flex items-center justify-center gap-2 rounded-full bg-reuseai-verde px-5 py-3 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul'
                      >
                        Criar conta
                      </a>
                      <a
                        href='/classificar'
                        className='inline-flex items-center justify-center gap-2 rounded-full border border-reuseai-verde/15 bg-white px-5 py-3 text-sm font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/5 dark:border-reuseai-verdeNeon/15 dark:bg-[#0f1813] dark:text-reuseai-branco'
                      >
                        Ver classificador
                      </a>
                    </motion.div>
                  </motion.div>
                )}
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── Leaderboard + Missions ── */}
        <section className='px-6 pb-16'>
          <div className='mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]'>
            {/* Leaderboard */}
            <motion.div
              variants={fadeUp}
              initial='hidden'
              whileInView='visible'
              viewport={{ once: true, margin: '-60px' }}
              className='rounded-[36px] border border-reuseai-verde/10 bg-white/92 p-6 shadow-[0_40px_90px_-60px_rgba(28,28,37,0.45)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/92 md:p-8'
            >
              <div className='flex flex-col gap-4 border-b border-reuseai-verde/10 pb-6 md:flex-row md:items-end md:justify-between'>
                <div>
                  <p className='text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
                    Ranking
                  </p>
                  <h2 className='mt-2 text-3xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                    Top usuários da semana
                  </h2>
                </div>
                {overview && (
                  <p className='text-sm text-reuseai-cinza dark:text-white/65'>
                    {overview.period.label}:{' '}
                    {formatDateRange(
                      overview.period.week_start,
                      overview.period.week_end,
                    )}
                  </p>
                )}
              </div>

              {isLoading && (
                <div className='flex min-h-[320px] items-center justify-center text-sm font-semibold text-reuseai-cinza dark:text-white/65'>
                  Carregando ranking...
                </div>
              )}

              {!isLoading && error && (
                <div className='mt-6 rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100'>
                  {error}
                </div>
              )}

              {!isLoading && !error && overview && (
                <motion.div
                  className='mt-6 space-y-4'
                  variants={staggerContainer}
                  initial='hidden'
                  whileInView='visible'
                  viewport={{ once: true, margin: '-40px' }}
                >
                  {overview.leaderboard.map(entry => (
                    <motion.div
                      key={entry.user_id}
                      variants={staggerItem}
                      whileHover={{ x: 3, transition: { duration: 0.2 } }}
                      className={`grid gap-4 rounded-3xl border px-5 py-4 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:items-center ${
                        entry.rank <= 3
                          ? 'border-reuseai-verde/20 bg-gradient-to-r from-reuseai-verde/10 via-white to-reuseai-azulClaro/10 dark:border-reuseai-verdeNeon/20 dark:from-[#102114] dark:via-[#101915] dark:to-[#10202a]'
                          : 'border-reuseai-verde/10 bg-reuseai-branco/70 dark:border-reuseai-verdeNeon/10 dark:bg-[#0d1510]'
                      }`}
                    >
                      <div className='flex h-12 w-12 items-center justify-center rounded-2xl bg-reuseai-verde/10 text-lg font-black text-reuseai-verde'>
                        {entry.rank}
                      </div>

                      <div className='flex min-w-0 items-center gap-3'>
                        <img
                          src={getUserAvatarUrl({ avatar_url: entry.avatar_url })}
                          alt={entry.username}
                          className='h-12 w-12 rounded-full border border-reuseai-verde/15 object-cover'
                        />
                        <div className='min-w-0'>
                        <a
                          href={`/usuarios/${entry.username}`}
                          className='block truncate text-base font-bold text-reuseai-preto transition-colors hover:text-reuseai-verde dark:text-reuseai-branco'
                        >
                          @{entry.username}
                        </a>
                          <p className='mt-1 text-sm text-reuseai-cinza dark:text-white/65'>
                            Nível {entry.level} • {entry.level_title}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className='text-xs font-semibold uppercase tracking-[0.22em] text-reuseai-cinza dark:text-white/55'>
                          XP semanal
                        </p>
                        <p className='mt-2 text-2xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                          {formatNumber(entry.weekly_xp)}
                        </p>
                      </div>

                      <div className='grid gap-2 text-sm text-reuseai-cinza dark:text-white/65'>
                        <span className='inline-flex items-center gap-2'>
                          <FontAwesomeIcon icon={faRecycle} className='text-reuseai-verde' />
                          {formatNumber(entry.total_analyses)} análises
                        </span>
                        <span className='inline-flex items-center gap-2'>
                          <FontAwesomeIcon icon={faBolt} className='text-reuseai-verde' />
                          {formatNumber(entry.xp_total)} XP total
                        </span>
                      </div>
                    </motion.div>
                  ))}

                  {overview.leaderboard.length === 0 && (
                    <div className='rounded-3xl border border-reuseai-verde/10 bg-reuseai-branco/70 px-5 py-8 text-center text-sm text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#0d1510] dark:text-white/65'>
                      O ranking ainda está vazio. As primeiras análises desta
                      semana vão abrir a disputa.
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>

            {/* Missions + tips + events */}
            <div className='space-y-6'>
              <motion.div
                variants={fadeUp}
                initial='hidden'
                whileInView='visible'
                viewport={{ once: true, margin: '-60px' }}
                className='rounded-[32px] border border-reuseai-verde/10 bg-white/92 p-6 shadow-[0_40px_90px_-60px_rgba(28,28,37,0.45)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/92'
              >
                <p className='text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
                  Missões da semana
                </p>
                <h2 className='mt-2 text-2xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                  Missões ativas
                </h2>
                <p className='mt-3 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
                  Pequenos objetivos para incentivar recorrência e descoberta de
                  novos materiais.
                </p>

                {(() => {
                  const allMissions = me?.missions ?? overview?.missions_preview ?? [];
                  const active = allMissions.filter(m => !m.completed && !m.claimed);
                  const allDone = allMissions.length > 0 && active.length === 0;

                  if (allDone) return <AllMissionsDoneCard />;

                  if (active.length === 0) return null;

                  return (
                    <div className='mt-6 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-reuseai-verde/5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-reuseai-verde/30 hover:[&::-webkit-scrollbar-thumb]:bg-reuseai-verde/50'
                      style={{ maxHeight: active.length > 2 ? '22rem' : undefined }}
                    >
                      <motion.div
                        className='space-y-4'
                        variants={staggerContainer}
                        initial='hidden'
                        animate='visible'
                      >
                        {active.map(mission => (
                          <MissionCard
                            key={mission.key}
                            mission={mission}
                            compact={Boolean(me)}
                          />
                        ))}
                      </motion.div>
                    </div>
                  );
                })()}
              </motion.div>

              <motion.div
                variants={fadeUp}
                initial='hidden'
                whileInView='visible'
                viewport={{ once: true, margin: '-60px' }}
                className='rounded-[32px] border border-reuseai-verde/10 bg-white/92 p-6 shadow-[0_40px_90px_-60px_rgba(28,28,37,0.45)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/92'
              >
                <div className='flex items-center gap-3'>
                  <span className='flex h-11 w-11 items-center justify-center rounded-2xl bg-reuseai-verde/10 text-reuseai-verde'>
                    <FontAwesomeIcon icon={faChartColumn} />
                  </span>
                  <div>
                    <p className='text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
                      Resumo
                    </p>
                    <h2 className='mt-1 text-2xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                      Como pontuar rápido
                    </h2>
                  </div>
                </div>

                <ul className='mt-6 space-y-3'>
                  {[
                    { icon: faRecycle, text: 'Toda análise concluída rende XP automaticamente.' },
                    { icon: faLeaf, text: 'Descobrir materiais novos e manter frequência diária libera bônus extras.' },
                    { icon: faTrophy, text: 'Depois do resultado, um quiz leve pode render XP adicional.' },
                    { icon: faCircleCheck, text: 'Itens sem confiança rendem só o XP base e ficam fora do ranking semanal.' },
                  ].map(({ icon, text }) => (
                    <li key={text} className='flex items-start gap-3'>
                      <span className='mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-reuseai-verde/10 text-xs text-reuseai-verde'>
                        <FontAwesomeIcon icon={icon} />
                      </span>
                      <span className='text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
                        {text}
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>

              <motion.div
                variants={fadeUp}
                initial='hidden'
                whileInView='visible'
                viewport={{ once: true, margin: '-60px' }}
                className='rounded-[32px] border border-reuseai-verde/10 bg-white/92 p-6 shadow-[0_40px_90px_-60px_rgba(28,28,37,0.45)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/92'
              >
                <div className='flex items-center gap-3'>
                  <span className='flex h-11 w-11 items-center justify-center rounded-2xl bg-reuseai-verde/10 text-reuseai-verde'>
                    <FontAwesomeIcon icon={faUsers} />
                  </span>
                  <div>
                    <p className='text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
                      Atividade
                    </p>
                    <h2 className='mt-1 text-2xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                      Últimos ganhos
                    </h2>
                  </div>
                </div>

                {me?.recent_events?.length ? (
                  <motion.div
                    className='mt-6 space-y-3'
                    variants={staggerContainer}
                    initial='hidden'
                    whileInView='visible'
                    viewport={{ once: true, margin: '-40px' }}
                  >
                    {me.recent_events.map(event => (
                      <motion.div
                        key={event.id}
                        variants={staggerItem}
                        className='flex items-center justify-between rounded-2xl border border-reuseai-verde/10 bg-reuseai-verde/5 px-4 py-3 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'
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
                ) : (
                  <p className='mt-6 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
                    Seus próximos ganhos de XP vão aparecer aqui assim que você
                    começar a usar a classificação com frequência.
                  </p>
                )}
              </motion.div>
            </div>
          </div>
        </section>
      </main>
      <div id='contato'>
        <Footer />
      </div>
    </>
  );
}
