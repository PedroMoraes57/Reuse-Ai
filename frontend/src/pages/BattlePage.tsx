import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBolt,
  faCircleCheck,
  faEye,
  faMedal,
  faRotate,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { motion } from 'framer-motion';
import Navbar from '../components/LandingPage/Navbar';
import Footer from '../components/LandingPage/Footer';
import {
  fetchBattleDetail,
  respondToBattle,
  submitBattleAnswer,
  type BattleQuestion,
  type BattleSummary,
} from '../services/SocialApi';
import { getAuthToken } from '../services/api';
import { getUserAvatarUrl } from '../utils/user';
import { fadeUp, staggerContainer, staggerItem } from '../utils/animations';

const BASE_BATTLE_QUESTION_COUNT = 6;
const TIEBREAKER_QUESTION_COUNT = 2;
const BATTLE_POLL_INTERVAL_MS = 1200;

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '--';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function roundLabel(question: BattleQuestion) {
  if (question.is_tiebreak) {
    return `Desempate ${question.tiebreak_index} de ${TIEBREAKER_QUESTION_COUNT}`;
  }

  return `Pergunta ${question.index + 1} de ${BASE_BATTLE_QUESTION_COUNT}`;
}

function turnLabel(
  battle: BattleSummary,
  currentQuestion?: BattleQuestion | null,
) {
  if (battle.status === 'pending') {
    return 'Aguardando resposta do convite';
  }

  if (battle.status === 'completed') {
    return 'Resultado final disponível';
  }

  const isTiebreakRound = Boolean(
    currentQuestion?.is_tiebreak ?? battle.current_question_is_tiebreak,
  );

  if (isTiebreakRound && battle.current_phase !== 'steal') {
    return battle.is_my_turn
      ? 'Sua vez no desempate'
      : `Agora é a vez de @${battle.current_turn_username ?? battle.opponent.username} no desempate`;
  }

  if (battle.current_phase === 'steal') {
    return battle.is_my_turn
      ? 'Chance de roubo liberada para você'
      : `@${battle.current_turn_username ?? battle.opponent.username} pode roubar 5 pontos agora`;
  }

  return battle.is_my_turn
    ? 'Sua vez de responder'
    : `Agora é a vez de @${battle.current_turn_username ?? battle.opponent.username}`;
}

function historyTitle(question: BattleQuestion, battle: BattleSummary) {
  if (question.points_awarded_user_id === null) {
    return 'Ninguém pontuou nesta rodada';
  }

  if (question.points_awarded_user_id === battle.opponent.id) {
    return `@${battle.opponent.username} marcou ${question.points_awarded} pontos`;
  }

  return `Você marcou ${question.points_awarded} pontos`;
}

function LiveDots() {
  return (
    <div className='flex items-center gap-1.5'>
      {[0, 1, 2].map(index => (
        <motion.span
          key={index}
          className='h-2.5 w-2.5 rounded-full bg-reuseai-verde'
          animate={{ opacity: [0.35, 1, 0.35], scale: [0.9, 1.1, 0.9] }}
          transition={{
            duration: 1,
            repeat: Number.POSITIVE_INFINITY,
            delay: index * 0.16,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

function QuestionOption({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type='button'
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-4 text-left text-sm transition-colors ${
        selected
          ? 'border-reuseai-verde bg-reuseai-verde/10 text-reuseai-preto dark:bg-reuseai-verde/15 dark:text-reuseai-branco'
          : 'border-reuseai-verde/10 bg-reuseai-verde/5 text-reuseai-preto hover:bg-reuseai-verde/10 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813] dark:text-reuseai-branco dark:hover:bg-[#132017]'
      } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
    >
      {label}
    </button>
  );
}

export default function BattlePage() {
  const { battleId = '' } = useParams();
  const parsedBattleId = Number(battleId);
  const [battle, setBattle] = useState<BattleSummary | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const previousBattleRef = useRef<BattleSummary | null>(null);

  useEffect(() => {
    if (!getAuthToken()) {
      window.location.href = '/login?next=/amigos';
      return;
    }

    if (!Number.isFinite(parsedBattleId) || parsedBattleId <= 0) {
      setError('Batalha inválida.');
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadBattle(options?: { silent?: boolean }) {
      try {
        const response = await fetchBattleDetail(parsedBattleId);
        if (cancelled) {
          return;
        }

        const previousBattle = previousBattleRef.current;
        const nextBattle = response.battle;
        previousBattleRef.current = nextBattle;
        setBattle(nextBattle);
        setError(null);

        if (previousBattle) {
          if (
            previousBattle.status !== 'completed' &&
            nextBattle.status === 'completed'
          ) {
            setFeedback({
              type: 'success',
              message: 'Os dois lados terminaram. O resultado final já foi liberado.',
            });
          } else if (
            previousBattle.current_turn_user_id !== nextBattle.current_turn_user_id &&
            nextBattle.is_my_turn
          ) {
            setFeedback({
              type: 'success',
              message:
                nextBattle.current_phase === 'steal'
                  ? 'Seu amigo errou. Você pode tentar roubar 5 pontos agora.'
                  : 'Seu turno começou. A pergunta já está liberada.',
            });
          }
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar essa batalha agora.',
        );
      } finally {
        if (!options?.silent && !cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadBattle();

    const intervalId = window.setInterval(() => {
      void loadBattle({ silent: true });
    }, BATTLE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [parsedBattleId]);

  useEffect(() => {
    setSelectedOptionId('');
  }, [battle?.current_question?.id, battle?.current_phase]);

  async function handleInviteAction(action: 'accept' | 'decline') {
    if (!battle) {
      return;
    }

    setBusyAction(`invite:${action}`);
    setFeedback(null);
    try {
      const response = await respondToBattle(battle.id, action);
      setBattle(response.battle);
      previousBattleRef.current = response.battle;
      setFeedback({
        type: 'success',
        message: response.detail,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Não foi possível responder a esse convite.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitCurrentTurn() {
    if (!battle?.current_question) {
      return;
    }

    if (!selectedOptionId) {
      setFeedback({
        type: 'error',
        message: 'Escolha uma alternativa antes de enviar sua resposta.',
      });
      return;
    }

    setBusyAction('submit-turn');
    setFeedback(null);
    try {
      const response = await submitBattleAnswer(
        battle.id,
        battle.current_question.id,
        selectedOptionId,
      );
      const tieBreakStarted =
        response.battle.status === 'active' &&
        response.battle.question_count > battle.question_count &&
        Boolean(response.battle.current_question?.is_tiebreak);

      let message = '';
      if (response.battle.status === 'completed') {
        message =
          response.battle.winner_user_id === null
            ? 'Resposta enviada. A batalha terminou empatada e cada jogador recebeu 2 XP extras pelo empate.'
            : 'Resposta enviada. Essa foi a rodada final e o resultado já está disponível.';
      } else if (tieBreakStarted) {
        message = response.answer_correct
          ? `Resposta enviada. Você marcou ${response.points_gained} pontos nesta rodada e o desempate começou.`
          : battle.current_phase === 'steal'
            ? 'Resposta enviada. O placar continuou igual nas 6 perguntas iniciais, então o desempate começou.'
            : 'Resposta enviada. As 6 perguntas iniciais terminaram empatadas, então o desempate começou.';
      } else {
        message = response.answer_correct
          ? `Resposta enviada. Você marcou ${response.points_gained} pontos nesta rodada.`
          : battle.current_phase === 'steal'
            ? 'Resposta enviada. Nenhum ponto foi marcado nesta tentativa de roubo.'
            : 'Resposta enviada. O outro jogador agora pode tentar roubar 5 pontos.';
      }

      setBattle(response.battle);
      previousBattleRef.current = response.battle;
      setFeedback({
        type: 'success',
        message,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Não foi possível enviar sua resposta.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  const currentQuestion = battle?.current_question ?? null;
  const didIWin =
    battle?.winner_user_id !== null && battle?.winner_user_id !== undefined
      ? battle.winner_user_id !== battle.opponent.id
      : false;

  return (
    <>
      <Navbar isStatic forceScrolled />
      <main className='min-h-screen bg-gradient-to-b from-reuseai-branco via-reuseai-branco to-reuseai-verdeClaro/10 px-4 py-6 dark:from-[#09100b] dark:via-[#0b100d] dark:to-[#122018] md:px-6 md:py-10'>
        <div className='mx-auto max-w-4xl'>
          <div className='mb-4 flex justify-end'>
            <a
              href='/amigos'
              className='inline-flex items-center justify-center gap-2 rounded-full border border-reuseai-verde/15 bg-white px-4 py-2.5 text-sm font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/5 dark:border-reuseai-verdeNeon/15 dark:bg-[#132017] dark:text-reuseai-branco'
            >
              Voltar para amigos
            </a>
          </div>

          {feedback && (
            <div
              className={`mb-4 rounded-3xl border px-5 py-4 text-sm font-medium ${
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
              Carregando batalha...
            </div>
          )}

          {!isLoading && error && (
            <div className='rounded-3xl border border-red-200 bg-red-50 px-6 py-5 text-sm font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100'>
              {error}
            </div>
          )}

          {!isLoading && !error && battle && (
            <>
              <motion.section
                variants={fadeUp}
                initial='hidden'
                animate='visible'
                className='rounded-[34px] border border-reuseai-verde/10 bg-white/94 p-6 shadow-[0_40px_100px_-60px_rgba(28,28,37,0.45)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/94 md:p-8'
              >
                <div className='flex flex-col gap-5 md:flex-row md:items-center md:justify-between'>
                  <div className='flex items-center gap-4'>
                    <img
                      src={getUserAvatarUrl(battle.opponent)}
                      alt={battle.opponent.username}
                      className='h-14 w-14 rounded-full border border-reuseai-verde/15 object-cover'
                    />
                    <div>
                      <p className='text-xs font-semibold uppercase tracking-[0.26em] text-reuseai-verde'>
                        Batalha ao vivo
                      </p>
                      <a
                        href={`/usuarios/${battle.opponent.username}`}
                        className='mt-2 block text-2xl font-black text-reuseai-preto transition-colors hover:text-reuseai-verde dark:text-reuseai-branco'
                      >
                        @{battle.opponent.username}
                      </a>
                    </div>
                  </div>

                  <div className='inline-flex items-center gap-3 rounded-full border border-reuseai-verde/15 bg-reuseai-verde/5 px-4 py-2.5 text-sm font-semibold text-reuseai-preto dark:border-reuseai-verdeNeon/15 dark:bg-[#0f1813] dark:text-reuseai-branco'>
                    <LiveDots />
                    {turnLabel(battle, currentQuestion)}
                  </div>
                </div>

                {battle.status === 'active' && currentQuestion && (
                  <div className='mt-6'>
                    <div className='flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-reuseai-verde'>
                      <span>{roundLabel(currentQuestion)}</span>
                      <span>•</span>
                      <span>
                        {battle.current_phase === 'steal'
                          ? 'Roubo vale 5 pontos'
                          : 'Pergunta vale 10 pontos'}
                      </span>
                      {currentQuestion.is_tiebreak && (
                        <>
                          <span>•</span>
                          <span>Rodada decisiva</span>
                        </>
                      )}
                    </div>

                    <h1 className='mt-4 text-3xl font-black leading-tight text-reuseai-preto dark:text-reuseai-branco md:text-4xl'>
                      {currentQuestion.prompt}
                    </h1>

                    <p className='mt-4 text-sm leading-7 text-reuseai-cinza dark:text-white/70'>
                      {currentQuestion.is_tiebreak
                        ? battle.current_phase === 'primary'
                          ? `O desempate foi ativado porque o placar ficou igual após as 6 perguntas iniciais. Nesta rodada, o turno principal pertence a @${currentQuestion.turn_username}. Se houver erro, @${currentQuestion.steal_username} ainda pode tentar o roubo.`
                          : `A resposta principal do desempate falhou. Agora @${currentQuestion.steal_username} tem uma única chance de marcar 5 pontos.`
                        : battle.current_phase === 'primary'
                          ? `O turno principal desta pergunta pertence a @${currentQuestion.turn_username}. Se houver erro, @${currentQuestion.steal_username} entra com a chance de roubo.`
                          : `A resposta principal falhou. Agora @${currentQuestion.steal_username} tem uma única chance de marcar 5 pontos.`}
                    </p>

                    {battle.can_submit_turn ? (
                      <div className='mt-6 space-y-3'>
                        {currentQuestion.options.map(option => (
                          <QuestionOption
                            key={option.id}
                            label={option.label}
                            selected={selectedOptionId === option.id}
                            disabled={busyAction === 'submit-turn'}
                            onClick={() => setSelectedOptionId(option.id)}
                          />
                        ))}

                        <button
                          type='button'
                          disabled={busyAction === 'submit-turn'}
                          onClick={() => void handleSubmitCurrentTurn()}
                          className='inline-flex items-center justify-center gap-2 rounded-full bg-reuseai-verde px-6 py-3 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
                        >
                          <FontAwesomeIcon icon={faBolt} />
                          {busyAction === 'submit-turn' ? 'Enviando...' : 'Enviar resposta'}
                        </button>
                      </div>
                    ) : (
                      <div className='mt-6 rounded-3xl border border-reuseai-verde/10 bg-reuseai-verde/5 px-5 py-5 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'>
                        <div className='flex items-center gap-3'>
                          <LiveDots />
                          <p className='text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                            Aguardando a jogada do outro usuário
                          </p>
                        </div>
                        <p className='mt-3 text-sm leading-7 text-reuseai-cinza dark:text-white/70'>
                          A pergunta atual fica visível para os dois lados, mas
                          só o jogador do turno pode responder agora. Assim que
                          a vez mudar, o formulário aparece automaticamente
                          aqui.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {battle.status === 'pending' && (
                  <div className='mt-6 rounded-3xl border border-reuseai-verde/10 bg-reuseai-verde/5 px-5 py-5 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'>
                    {battle.can_respond_to_invite ? (
                      <>
                        <p className='text-lg font-black text-reuseai-preto dark:text-reuseai-branco'>
                          Convite aguardando sua decisão
                        </p>
                        <p className='mt-3 text-sm leading-7 text-reuseai-cinza dark:text-white/70'>
                          Ao aceitar, o quiz compartilhado é aberto
                          imediatamente nas duas telas.
                        </p>
                        <div className='mt-5 flex flex-col gap-3 sm:flex-row'>
                          <button
                            type='button'
                            disabled={busyAction === 'invite:accept'}
                            onClick={() => void handleInviteAction('accept')}
                            className='inline-flex items-center justify-center gap-2 rounded-full bg-reuseai-verde px-5 py-3 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
                          >
                            <FontAwesomeIcon icon={faCircleCheck} />
                            Aceitar batalha
                          </button>
                          <button
                            type='button'
                            disabled={busyAction === 'invite:decline'}
                            onClick={() => void handleInviteAction('decline')}
                            className='inline-flex items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100 dark:hover:bg-red-500/15'
                          >
                            <FontAwesomeIcon icon={faXmark} />
                            Recusar
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className='flex items-center gap-3'>
                          <LiveDots />
                          <p className='text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                            Convite enviado e aguardando resposta
                          </p>
                        </div>
                        <p className='mt-3 text-sm leading-7 text-reuseai-cinza dark:text-white/70'>
                          Assim que @{battle.opponent.username} aceitar, a
                          batalha sai do estado de espera e o quiz já abre
                          automaticamente para os dois.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {battle.status === 'completed' && (
                  <div className='mt-6 rounded-3xl border border-reuseai-verde/10 bg-reuseai-verde/5 px-5 py-5 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'>
                    <p className='text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
                      Resultado final
                    </p>
                    <h2 className='mt-2 text-2xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                      {battle.winner_user_id === null
                        ? battle.question_count > BASE_BATTLE_QUESTION_COUNT
                          ? 'Empate mesmo após o desempate'
                          : 'Empate na batalha'
                        : didIWin
                          ? 'Você venceu a batalha'
                          : `@${battle.opponent.username} venceu a batalha`}
                    </h2>
                    <p className='mt-4 text-sm leading-7 text-reuseai-cinza dark:text-white/70'>
                      Placar final: {battle.my_score} x {battle.opponent_score}
                    </p>
                    {battle.winner_user_id === null && (
                      <p className='mt-2 text-sm leading-7 text-reuseai-cinza dark:text-white/70'>
                        Como o placar terminou empatado, cada jogador recebe 2
                        XP extras pelo empate.
                      </p>
                    )}
                    <p className='mt-2 text-sm leading-7 text-reuseai-cinza dark:text-white/70'>
                      Encerrada em {formatDate(battle.completed_at)}
                    </p>
                  </div>
                )}
              </motion.section>

              <motion.section
                variants={fadeUp}
                initial='hidden'
                animate='visible'
                className='mt-5 rounded-[30px] border border-reuseai-verde/10 bg-white/92 p-5 shadow-[0_30px_90px_-60px_rgba(28,28,37,0.45)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/92 md:p-6'
              >
                <div className='grid gap-4 md:grid-cols-4'>
                  {[
                    {
                      icon: faMedal,
                      label: 'Seu placar total',
                      value: String(battle.my_score),
                    },
                    {
                      icon: faMedal,
                      label: 'Placar do oponente',
                      value: String(battle.opponent_score),
                    },
                    {
                      icon: faRotate,
                      label: 'Andamento',
                      value: `${battle.resolved_questions}/${battle.question_count}`,
                    },
                    {
                      icon: battle.is_my_turn ? faBolt : faEye,
                      label: 'Turno atual',
                      value: battle.is_my_turn ? 'Você' : '@' + battle.opponent.username,
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
                      <p className='mt-3 text-2xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.section>

              {battle.status === 'completed' && battle.questions && (
                <motion.section
                  variants={fadeUp}
                  initial='hidden'
                  animate='visible'
                  className='mt-5 rounded-[30px] border border-reuseai-verde/10 bg-white/92 p-5 shadow-[0_30px_90px_-60px_rgba(28,28,37,0.45)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/92 md:p-6'
                >
                  <p className='text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
                    Rodadas concluídas
                  </p>
                  <h2 className='mt-2 text-2xl font-black text-reuseai-preto dark:text-reuseai-branco'>
                    Histórico do quiz compartilhado
                  </h2>

                  <motion.div
                    variants={staggerContainer}
                    initial='hidden'
                    animate='visible'
                    className='mt-6 space-y-4'
                  >
                    {battle.questions.map(question => (
                      <motion.div
                        key={question.id}
                        variants={staggerItem}
                        className='rounded-3xl border border-reuseai-verde/10 bg-reuseai-verde/5 p-5 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'
                      >
                        <div className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
                          <div className='min-w-0'>
                            <p className='text-xs font-semibold uppercase tracking-[0.22em] text-reuseai-verde'>
                              {question.is_tiebreak
                                ? `Desempate ${question.tiebreak_index}`
                                : `Pergunta ${question.index + 1}`}
                            </p>
                            <h3 className='mt-2 text-lg font-black text-reuseai-preto dark:text-reuseai-branco'>
                              {question.prompt}
                            </h3>
                            <p className='mt-3 text-sm text-reuseai-cinza dark:text-white/70'>
                              {historyTitle(question, battle)}
                            </p>
                          </div>

                          <div className='rounded-2xl bg-white/80 px-4 py-3 text-sm font-semibold text-reuseai-preto dark:bg-[#132017] dark:text-reuseai-branco'>
                            +{question.points_awarded} pts
                          </div>
                        </div>

                        <div className='mt-5 grid gap-3 lg:grid-cols-2'>
                          <div className='rounded-2xl border border-reuseai-verde/10 bg-white px-4 py-4 dark:border-reuseai-verdeNeon/10 dark:bg-[#132017]'>
                            <p className='text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                              Turno principal de @{question.turn_username}
                            </p>
                            <p className='mt-2 text-sm text-reuseai-cinza dark:text-white/70'>
                              {question.primary_answer_label || 'Sem resposta'}
                            </p>
                            {question.primary_is_correct !== null && (
                              <p className='mt-2 text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                                {question.primary_is_correct ? 'Acertou' : 'Errou'}
                              </p>
                            )}
                          </div>

                          <div className='rounded-2xl border border-reuseai-verde/10 bg-white px-4 py-4 dark:border-reuseai-verdeNeon/10 dark:bg-[#132017]'>
                            <p className='text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                              Roubo de @{question.steal_username}
                            </p>
                            <p className='mt-2 text-sm text-reuseai-cinza dark:text-white/70'>
                              {question.steal_answer_label || 'Não foi usado'}
                            </p>
                            {question.steal_is_correct !== null && (
                              <p className='mt-2 text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                                {question.steal_is_correct ? 'Acertou' : 'Errou'}
                              </p>
                            )}
                          </div>
                        </div>

                        {question.correct_label && (
                          <p className='mt-4 text-sm text-reuseai-cinza dark:text-white/70'>
                            Resposta correta: {question.correct_label}
                          </p>
                        )}
                      </motion.div>
                    ))}
                  </motion.div>
                </motion.section>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
