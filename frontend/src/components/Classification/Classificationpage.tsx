import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useNavigate } from 'react-router-dom';
import {
  faCircleQuestion,
  faBolt,
  faCamera,
  faChevronDown,
  faChevronUp,
  faCircleCheck,
  faLeaf,
  faLocationDot,
  faMedal,
  faRecycle,
  faRobot,
  faSeedling,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { AnimatePresence, motion } from 'framer-motion';
import { LocationMapPanel, UploadPanel, ResultPanel } from '../Classification';
import type { BrowserLocationState } from './LocationMapPanel';
import { AnalysisQuizCard } from '../Game/AnalysisQuizCard';
import {
  analyzeWaste,
  fetchNearbyDisposalPoints,
  type ClassificationResult,
  type NearbyDisposalPointsResponse,
} from '../../services/ClassificationApi';
import { clearAuthToken, getAuthToken } from '../../services/api';
import { me as fetchMe } from '../../services/AuthApi';
import {
  fetchGameOverview,
  submitQuizAnswers,
  type GameOverview,
  type GameProfileSummary,
  type QuizSubmissionResponse,
} from '../../services/GamificationApi';
import {
  fadeUp,
  scalePop,
  staggerContainer,
  staggerItem,
} from '../../utils/animations';
import { useAssistant } from '../../contexts/useAssistant';

const heroHighlights = [
  {
    icon: faCamera,
    title: 'Envio simples',
    description: 'Capture ou selecione uma foto em poucos segundos.',
  },
  {
    icon: faRobot,
    title: 'Leitura com IA',
    description: 'O sistema interpreta o material e organiza a melhor rota.',
  },
  {
    icon: faLocationDot,
    title: 'Saiba exatamente o que fazer',
    description: 'Receba uma orientação direta para descartar corretamente.',
  },
];

const benefitCards = [
  {
    icon: faSeedling,
    title: 'Tipo identificado',
    description:
      'Detectamos o material principal do objeto para orientar o descarte corretamente.',
  },
  {
    icon: faRecycle,
    title: 'Pode reciclar?',
    description:
      'Veja na hora se o item é reciclável e quais são as limitações.',
  },
  {
    icon: faCircleCheck,
    title: 'Onde descartar',
    description:
      'Receba a forma correta de descarte e para onde levar o objeto.',
  },
];

export function ClassificationPageContent() {
  const { setAnalysisContext } = useAssistant();
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationState, setLocationState] = useState<BrowserLocationState>({
    status: 'idle',
  });
  const [nearbyResponse, setNearbyResponse] =
    useState<NearbyDisposalPointsResponse | null>(null);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    Boolean(getAuthToken()),
  );
  const [overview, setOverview] = useState<GameOverview | null>(null);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [quizSubmission, setQuizSubmission] =
    useState<QuizSubmissionResponse | null>(null);
  const [heroCollapsed, setHeroCollapsed] = useState(
    () => localStorage.getItem('reuseai_classify_hero_open') === 'false',
  );
  const navigate = useNavigate();

  function toggleHero() {
    setHeroCollapsed(c => {
      const next = !c;
      localStorage.setItem('reuseai_classify_hero_open', next ? 'false' : 'true');
      return next;
    });
  }
  const nearbyRequestIdRef = useRef(0);

  function updateOverviewProfile(nextProfile: GameProfileSummary) {
    setOverview(current => {
      if (!current?.me) {
        return current;
      }

      return {
        ...current,
        me: {
          ...current.me,
          profile: nextProfile,
        },
      };
    });
  }

  const refreshGameOverview = useEffectEvent(async () => {
    if (!getAuthToken()) {
      setOverview(null);
      return;
    }

    try {
      const data = await fetchGameOverview();
      setOverview(data);
    } catch {}
  });

  const scrollToQuiz = useEffectEvent(() => {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        document.getElementById('analysis-quiz')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 120);
    });
  });

  const requestUserLocation = useEffectEvent(() => {
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setLocationState({
        status: 'error',
        message:
          'A localização precisa de uma conexão segura para funcionar fora do ambiente local.',
      });
      return;
    }

    if (!('geolocation' in navigator)) {
      setLocationState({
        status: 'unsupported',
        message:
          'Seu navegador não oferece geolocalização para buscar pontos próximos.',
      });
      return;
    }

    setLocationState({
      status: 'requesting',
    });

    navigator.geolocation.getCurrentPosition(
      position => {
        setLocationState({
          status: 'granted',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          message: 'Localização liberada. Vamos usar isso apenas para sugerir pontos próximos.',
        });
      },
      geoError => {
        const deniedMessage =
          geoError.code === geoError.PERMISSION_DENIED
            ? 'Sem sua permissão, o mapa não consegue sugerir locais próximos.'
            : 'Não consegui obter sua localização agora. Você pode tentar novamente.';

        setLocationState({
          status: geoError.code === geoError.PERMISSION_DENIED ? 'denied' : 'error',
          message: deniedMessage,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
  });

  const loadNearbyPoints = useEffectEvent(
    async (targetResult: ClassificationResult, targetLocation: BrowserLocationState) => {
      if (
        targetLocation.status !== 'granted' ||
        typeof targetLocation.latitude !== 'number' ||
        typeof targetLocation.longitude !== 'number' ||
        !targetResult.best_match?.disposal_stream ||
        targetResult.uncertain_prediction
      ) {
        return;
      }

      const requestId = ++nearbyRequestIdRef.current;
      setIsLoadingNearby(true);
      setNearbyError(null);

      try {
        const resultLocation = targetResult.best_match?.location as
          | {
              city?: string | null;
              state_name?: string | null;
              state_code?: string | null;
              country_code?: string | null;
            }
          | null
          | undefined;
        const data = await fetchNearbyDisposalPoints({
          disposalStream: targetResult.best_match.disposal_stream,
          latitude: targetLocation.latitude,
          longitude: targetLocation.longitude,
          city: resultLocation?.city ?? undefined,
          state: resultLocation?.state_name ?? undefined,
          stateCode: resultLocation?.state_code ?? undefined,
          countryCode: resultLocation?.country_code ?? undefined,
        });

        if (nearbyRequestIdRef.current !== requestId) {
          return;
        }

        setNearbyResponse(data);
      } catch (err) {
        if (nearbyRequestIdRef.current !== requestId) {
          return;
        }

        setNearbyResponse(null);
        setNearbyError(
          err instanceof Error
            ? err.message
            : 'Não foi possível buscar os pontos de descarte próximos.',
        );
      } finally {
        if (nearbyRequestIdRef.current === requestId) {
          setIsLoadingNearby(false);
        }
      }
    },
  );

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setIsAuthenticated(false);
      setOverview(null);
      return;
    }

    fetchMe()
      .then(() => {
        setIsAuthenticated(true);
        void refreshGameOverview();
      })
      .catch(() => {
        clearAuthToken();
        setIsAuthenticated(false);
        setOverview(null);
      });
  }, []);

  useEffect(() => {
    if (!result) {
      return;
    }
    setAnalysisContext(result);
  }, [result, setAnalysisContext]);

  function redirectToLogin() {
    navigate('/login?next=/classificar');
  }

  async function handleAnalyze(file: File) {
    if (!getAuthToken()) {
      setError('Entre na sua conta para analisar imagens com a IA.');
      setIsAuthenticated(false);
      redirectToLogin();
      return;
    }

    setIsLoading(true);
    setResult(null);
    setError(null);
    setNearbyResponse(null);
    setNearbyError(null);
    setQuizError(null);
    setQuizSubmission(null);

    try {
      const data = await analyzeWaste(
        file,
        locationState.status === 'granted' &&
          typeof locationState.latitude === 'number' &&
          typeof locationState.longitude === 'number'
          ? {
              latitude: locationState.latitude,
              longitude: locationState.longitude,
            }
          : undefined,
      );
      setResult(data);
      if (data.game_update?.profile) {
        updateOverviewProfile(data.game_update.profile);
      }
      void refreshGameOverview();
      if (window.innerWidth <= 900) {
        document.getElementById('result-panel')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível analisar a imagem.';

      if (
        message.toLowerCase().includes('authentication') ||
        message.toLowerCase().includes('not authenticated') ||
        message.toLowerCase().includes('credenciais') ||
        message.toLowerCase().includes('autenticação')
      ) {
        clearAuthToken();
        setIsAuthenticated(false);
        setError('Sua sessão expirou. Entre novamente para continuar.');
        redirectToLogin();
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleQuizSubmit(answers: Record<string, string>) {
    const quiz = result?.quiz;
    if (!quiz) {
      return;
    }

    setIsSubmittingQuiz(true);
    setQuizError(null);

    try {
      const response = await submitQuizAnswers(quiz.analysis_id, answers);
      setQuizSubmission(response);
      updateOverviewProfile(response.profile);
      void refreshGameOverview();
    } catch (err) {
      setQuizError(
        err instanceof Error
          ? err.message
          : 'Não foi possível enviar o quiz agora.',
      );
    } finally {
      setIsSubmittingQuiz(false);
    }
  }

  function handleRetryNearby() {
    if (!result) {
      return;
    }
    void loadNearbyPoints(result, locationState);
  }

  useEffect(() => {
    if (
      !result ||
      locationState.status !== 'granted' ||
      typeof locationState.latitude !== 'number' ||
      typeof locationState.longitude !== 'number'
    ) {
      if (!result || locationState.status !== 'granted') {
        setNearbyResponse(null);
        setNearbyError(null);
        setIsLoadingNearby(false);
      }
      return;
    }

    if (result.uncertain_prediction || !result.best_match?.disposal_stream) {
      setNearbyResponse(null);
      setNearbyError(null);
      setIsLoadingNearby(false);
      return;
    }

    void loadNearbyPoints(result, locationState);
  }, [
    result?.analysis_id,
    result?.best_match?.disposal_stream,
    result?.uncertain_prediction,
    locationState.status,
    locationState.latitude,
    locationState.longitude,
  ]);

  const currentPlayer = overview?.me;

  return (
    <main className='bg-reuseai-branco dark:bg-[#0b100d]'>
      {/* ── Hero ── */}
      <section className='relative overflow-hidden bg-gradient-to-br from-reuseai-branco via-reuseai-verdeClaro/10 to-reuseai-azulClaro/10 px-6 dark:from-[#09100b] dark:via-[#0d1711] dark:to-[#0d1720]'>
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(120,216,78,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(56,182,255,0.12),transparent_32%)]' />
        <div className='absolute -right-20 top-10 h-64 w-64 rounded-full bg-reuseai-verdeClaro/20 blur-3xl' />
        <div className='absolute -left-16 bottom-4 h-56 w-56 rounded-full bg-reuseai-azulClaro/10 blur-3xl' />

        <AnimatePresence initial={false}>
          {!heroCollapsed && (
            <motion.div
              key='hero-content'
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div className='relative py-16'>
        <div className='relative mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] lg:items-center'>
          {/* Left: copy */}
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
              <FontAwesomeIcon icon={faRecycle} />
              Classificação com IA
            </motion.span>

            <motion.h1
              variants={fadeUp}
              className='mt-6 text-4xl font-black leading-tight text-reuseai-preto dark:text-reuseai-branco md:text-6xl'
            >
              Descarte certo, com uma experiência mais clara e direta.
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className='mt-5 max-w-xl text-base leading-7 text-reuseai-cinza dark:text-white/70 md:text-lg'
            >
              Envie uma imagem e descubra em segundos como descartar
              corretamente. Identificamos o objeto, analisamos o material e
              mostramos se ele pode ser reciclado, junto com o destino ideal.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className='mt-8 flex flex-col gap-4 sm:flex-row'
            >
              <a
                href='#analisar'
                className='inline-flex items-center justify-center gap-2 rounded-full bg-reuseai-verde px-6 py-3.5 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul'
              >
                <FontAwesomeIcon icon={faCamera} />
                Analisar agora
              </a>
            </motion.div>

            <motion.div
              variants={staggerContainer}
              className='mt-10 grid gap-4 sm:grid-cols-3'
            >
              {benefitCards.map(card => (
                <motion.div
                  key={card.title}
                  variants={staggerItem}
                  className='rounded-2xl border border-reuseai-verde/10 bg-white/85 p-4 shadow-[0_24px_50px_-40px_rgba(28,28,37,0.35)] backdrop-blur-sm dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/85'
                  whileHover={{ y: -3, transition: { duration: 0.2 } }}
                >
                  <div className='flex h-11 w-11 items-center justify-center rounded-2xl bg-reuseai-verde/10 text-lg text-reuseai-verde'>
                    <FontAwesomeIcon icon={card.icon} />
                  </div>
                  <h2 className='mt-4 text-sm font-bold text-reuseai-preto dark:text-reuseai-branco'>
                    {card.title}
                  </h2>
                  <p className='mt-2 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
                    {card.description}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right: flow card */}
          <motion.div
            variants={fadeUp}
            initial='hidden'
            animate='visible'
            transition={{ delay: 0.15 }}
            className='rounded-[32px] border border-reuseai-verde/10 bg-white/90 p-6 shadow-[0_40px_80px_-50px_rgba(28,28,37,0.4)] backdrop-blur-xl dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/90'
          >
            <div className='flex items-center justify-between gap-4'>
              <div>
                <p className='text-xs font-semibold uppercase tracking-[0.28em] text-reuseai-verde'>
                  Fluxo Inteligente
                </p>
                <h2 className='mt-2 text-2xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                  Etapas do uso da nossa classificação com IA
                </h2>
              </div>
              <div className='hidden h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-reuseai-verde/10 text-xl text-reuseai-verde sm:flex'>
                <FontAwesomeIcon icon={faLeaf} />
              </div>
            </div>

            <motion.div
              className='mt-6 space-y-4'
              variants={staggerContainer}
              initial='hidden'
              animate='visible'
            >
              {heroHighlights.map((item, index) => (
                <motion.div
                  key={item.title}
                  variants={staggerItem}
                  className='flex gap-4 rounded-2xl border border-reuseai-verde/10 bg-reuseai-branco p-4 dark:border-reuseai-verdeNeon/10 dark:bg-[#0d1510]'
                >
                  <div className='flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-reuseai-verde/10 text-lg text-reuseai-verde'>
                    <FontAwesomeIcon icon={item.icon} />
                  </div>
                  <div>
                    <p className='text-xs font-semibold uppercase tracking-[0.22em] text-reuseai-cinza/60 dark:text-white/55'>
                      Etapa {index + 1}
                    </p>
                    <h3 className='mt-1 text-base font-bold text-reuseai-preto dark:text-reuseai-branco'>
                      {item.title}
                    </h3>
                    <p className='mt-1 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
                      {item.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            <div className='mt-6 rounded-2xl border border-reuseai-verde/15 bg-reuseai-verde/5 p-5 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'>
              <p className='text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                Foque no que importa
              </p>
              <p className='mt-2 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
                Veja rapidamente o que é o objeto, se pode ser reciclado e como
                descartar sem erro.
              </p>
            </div>
          </motion.div>
        </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle button */}
        <div className='relative flex justify-center py-3'>
          <button
            onClick={toggleHero}
            className='flex items-center gap-2 rounded-full border border-reuseai-verde/15 bg-white/90 px-4 py-2 text-xs font-semibold text-reuseai-cinza shadow-sm backdrop-blur-sm transition-colors hover:bg-white hover:text-reuseai-verde dark:border-reuseai-verdeNeon/15 dark:bg-[#101915]/90 dark:text-white/60 dark:hover:bg-[#101915] dark:hover:text-reuseai-verdeNeon'
          >
            <FontAwesomeIcon icon={heroCollapsed ? faChevronDown : faChevronUp} className='text-xs' />
            {heroCollapsed ? 'Mostrar detalhes' : 'Ocultar detalhes'}
          </button>
        </div>
      </section>

      {/* ── Área de análise ── */}
      <section
        id='aplicativo'
        className='bg-gradient-to-b from-reuseai-branco via-reuseai-branco to-reuseai-verdeClaro/10 px-6 py-16 dark:from-[#0b100d] dark:via-[#0b100d] dark:to-[#122018]'
      >
        <div className='mx-auto max-w-6xl'>
          <motion.div
            data-tutorial='classification-section'
            className='mb-10 max-w-3xl'
            variants={fadeUp}
            initial='hidden'
            whileInView='visible'
            viewport={{ once: true, margin: '-60px' }}
          >
            <span
              id='analisar'
              className='text-sm font-semibold uppercase tracking-[0.28em] text-reuseai-verde'
            >
              Área de Análise
            </span>
            <h2 className='mt-3 text-3xl font-black text-reuseai-preto dark:text-reuseai-branco md:text-4xl'>
              Envie sua imagem e veja o resultado na hora
            </h2>
            <p className='mt-4 text-sm leading-7 text-reuseai-cinza dark:text-white/70 md:text-base'>
              Tire uma foto ou escolha da galeria para identificar o objeto em
              poucos segundos. A análise mostra o tipo de material, informa se é
              reciclável e orienta exatamente como fazer o descarte correto.
            </p>
          </motion.div>

          <AnimatePresence>
            {isAuthenticated && currentPlayer && (
              <motion.div
                variants={staggerContainer}
                initial='hidden'
                animate='visible'
                exit={{ opacity: 0 }}
                className='mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4'
              >
                {[
                  { icon: faBolt, label: 'XP total', value: currentPlayer.profile.xp_total, sub: currentPlayer.profile.level_title },
                  { icon: faMedal, label: 'Posição semanal', value: currentPlayer.rank ? `#${currentPlayer.rank}` : '-', sub: 'ranking em andamento' },
                  { icon: faLeaf, label: 'Sequência', value: currentPlayer.profile.current_streak, sub: 'dias ativos' },
                  { icon: faRecycle, label: 'Análises', value: currentPlayer.profile.total_analyses, sub: 'concluídas até agora' },
                ].map(stat => (
                  <motion.div
                    key={stat.label}
                    variants={staggerItem}
                    whileHover={{ y: -3, transition: { duration: 0.2 } }}
                    className='rounded-3xl border border-reuseai-verde/10 bg-white/88 p-5 shadow-[0_24px_60px_-48px_rgba(28,28,37,0.35)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/88'
                  >
                    <p className='flex items-center gap-2 text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                      <FontAwesomeIcon icon={stat.icon} className='text-reuseai-verde' />
                      {stat.label}
                    </p>
                    <p className='mt-3 text-3xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                      {stat.value}
                    </p>
                    <p className='mt-2 text-sm text-reuseai-cinza dark:text-white/65'>
                      {stat.sub}
                    </p>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div
                variants={fadeUp}
                initial='hidden'
                animate='visible'
                exit='exit'
                className='mb-8 flex max-w-3xl items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100'
              >
                <FontAwesomeIcon
                  icon={faTriangleExclamation}
                  className='mt-0.5 flex-shrink-0 text-red-500'
                />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className='grid items-start gap-7 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]'>
            <div className='space-y-6'>
              <UploadPanel
                onAnalyze={handleAnalyze}
                isLoading={isLoading}
                isAuthenticated={isAuthenticated}
                onRequireLogin={redirectToLogin}
              />
            </div>

            <div id='result-panel' className='space-y-6'>
              <AnimatePresence>
                {result?.quiz && (
                  <motion.div
                    variants={fadeUp}
                    initial='hidden'
                    animate='visible'
                    exit='exit'
                    className='rounded-[28px] border border-reuseai-verde/10 bg-white/95 p-5 shadow-[0_30px_60px_-45px_rgba(28,28,37,0.35)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/95'
                  >
                    <div className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
                      <div className='flex gap-3'>
                        <span className='flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-reuseai-verde/10 text-lg text-reuseai-verde'>
                          <FontAwesomeIcon icon={faCircleQuestion} />
                        </span>
                        <div>
                          <p className='inline-flex items-center gap-2 rounded-full bg-reuseai-verde/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
                            <FontAwesomeIcon icon={faBolt} />
                            Quiz disponível
                          </p>
                          <h3 className='mt-3 text-xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                            Desafio relâmpago do item analisado
                          </h3>
                          <p className='mt-2 max-w-2xl text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
                            {quizSubmission
                              ? `Você já concluiu este quiz e somou ${quizSubmission.xp_gained} XP extras.`
                              : `Ganhe até ${result.quiz.questions.length * result.quiz.xp_per_correct_answer} XP extras com perguntas rápidas sobre o resultado que acabou de aparecer.`}
                          </p>
                        </div>
                      </div>

                      <div className='flex flex-wrap gap-3'>
                        <motion.button
                          type='button'
                          onClick={() => scrollToQuiz()}
                          className='inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-reuseai-verde px-4 py-2.5 text-sm font-semibold text-reuseai-branco hover:bg-reuseai-azul'
                          animate={quizSubmission ? {} : { scale: [1, 1.05, 1] }}
                          transition={quizSubmission ? {} : { duration: 1.6, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }}
                          whileHover={{ scale: 1.06 }}
                          whileTap={{ scale: 0.96 }}
                        >
                          <FontAwesomeIcon icon={faBolt} />
                          {quizSubmission ? 'Ver quiz' : 'Abrir quiz'}
                        </motion.button>

                        <a
                          href='/ranking'
                          className='inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-reuseai-verde/15 bg-reuseai-verde/5 px-4 py-2.5 text-sm font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/10 dark:border-reuseai-verdeNeon/15 dark:bg-[#0f1813] dark:text-reuseai-branco'
                        >
                          <FontAwesomeIcon icon={faMedal} />
                          Ver ranking
                        </a>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <ResultPanel result={result} isLoading={isLoading} />

              <AnimatePresence>
                {quizError && (
                  <motion.div
                    variants={fadeUp}
                    initial='hidden'
                    animate='visible'
                    exit='exit'
                    className='rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100'
                  >
                    {quizError}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <AnimatePresence>
            {result && (
              <motion.div
                variants={fadeUp}
                initial='hidden'
                animate='visible'
                exit='exit'
                className='mt-7'
              >
                <LocationMapPanel
                  result={result}
                  locationState={locationState}
                  nearbyResponse={nearbyResponse}
                  nearbyError={nearbyError}
                  isLoadingNearby={isLoadingNearby}
                  onRequestLocation={requestUserLocation}
                  onRetryNearby={handleRetryNearby}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {result?.quiz && (
              <motion.div
                id='analysis-quiz'
                variants={fadeUp}
                initial='hidden'
                animate='visible'
                exit='exit'
                className='mt-8'
              >
                <AnalysisQuizCard
                  quiz={result.quiz}
                  isSubmitting={isSubmittingQuiz}
                  submission={quizSubmission}
                  onSubmit={handleQuizSubmit}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
}
