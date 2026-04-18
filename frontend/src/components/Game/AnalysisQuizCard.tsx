import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBolt,
  faCircleCheck,
  faCircleQuestion,
  faTrophy,
} from '@fortawesome/free-solid-svg-icons';
import { AnimatePresence, motion } from 'framer-motion';
import type {
  AnalysisQuiz,
  QuizResultItem,
  QuizSubmissionResponse,
} from '../../services/GamificationApi';
import {
  expandCollapse,
  scalePop,
  staggerContainer,
  staggerItem,
} from '../../utils/animations';

interface AnalysisQuizCardProps {
  quiz: AnalysisQuiz | null;
  isSubmitting: boolean;
  submission: QuizSubmissionResponse | null;
  onSubmit: (answers: Record<string, string>) => void;
}

export function AnalysisQuizCard({
  quiz,
  isSubmitting,
  submission,
  onSubmit,
}: AnalysisQuizCardProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    setAnswers({});
    setIsExpanded(true);
  }, [quiz?.analysis_id]);

  const resultsByQuestion = useMemo(() => {
    if (!submission) {
      return new Map<string, QuizResultItem>();
    }

    return new Map(
      submission.results.map(result => [result.question_id, result]),
    );
  }, [submission]);

  if (!quiz) {
    return null;
  }

  const allAnswered = quiz.questions.every(question => answers[question.id]);
  const isCompleted = submission?.analysis_id === quiz.analysis_id;

  return (
    <div className='rounded-[28px] border border-reuseai-verde/10 bg-white p-6 shadow-[0_30px_60px_-45px_rgba(28,28,37,0.4)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]'>
      <div className='flex flex-col gap-4 border-b border-reuseai-verde/10 pb-5 md:flex-row md:items-start md:justify-between'>
        <div className='flex gap-3'>
          <span className='flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-reuseai-verde/10 text-lg text-reuseai-verde'>
            <FontAwesomeIcon icon={faBolt} />
          </span>
          <div>
            <p className='inline-flex items-center gap-2 rounded-full bg-reuseai-verde/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
              <FontAwesomeIcon icon={faBolt} />
              Quiz opcional
            </p>
            <h3 className='mt-3 text-xl font-black text-reuseai-preto dark:text-reuseai-branco'>
              {quiz.title}
            </h3>
            <p className='mt-2 max-w-2xl text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
              {quiz.description}
            </p>
          </div>
        </div>

        <motion.button
          type='button'
          onClick={() => setIsExpanded(current => !current)}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.15 }}
          className='inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-reuseai-verde/15 bg-reuseai-verde/5 px-4 py-2 text-xs font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/10 dark:border-reuseai-verdeNeon/15 dark:bg-[#0f1813] dark:text-reuseai-branco'
        >
          <FontAwesomeIcon icon={faCircleQuestion} />
          {isExpanded ? 'Ocultar quiz' : 'Abrir quiz'}
        </motion.button>
      </div>

      <div className='mt-5 flex flex-wrap gap-3'>
        <span className='inline-flex items-center gap-2 rounded-full bg-reuseai-verde px-4 py-1.5 text-xs font-bold text-reuseai-branco'>
          <FontAwesomeIcon icon={faTrophy} />
          Até {quiz.questions.length * quiz.xp_per_correct_answer} XP extras
        </span>
        <span className='rounded-full border border-reuseai-verde/10 bg-white px-4 py-1.5 text-xs font-medium text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813] dark:text-white/65'>
          3 perguntas leves sobre o item que você acabou de ver
        </span>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key='quiz-content'
            variants={expandCollapse}
            initial='hidden'
            animate='visible'
            exit='exit'
            style={{ overflow: 'hidden' }}
          >
            <motion.div
              className='mt-6 space-y-4'
              variants={staggerContainer}
              initial='hidden'
              animate='visible'
            >
              {quiz.questions.map((question, index) => {
                const result = resultsByQuestion.get(question.id);

                return (
                  <motion.div
                    key={question.id}
                    variants={staggerItem}
                    className='rounded-3xl border border-reuseai-verde/10 bg-reuseai-branco/80 p-5 dark:border-reuseai-verdeNeon/10 dark:bg-[#0d1510]'
                  >
                    <p className='text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-verde'>
                      Pergunta {index + 1}
                    </p>
                    <h4 className='mt-2 text-base font-bold text-reuseai-preto dark:text-reuseai-branco'>
                      {question.prompt}
                    </h4>

                    <div className='mt-4 grid gap-3 sm:grid-cols-2'>
                      {question.options.map(option => {
                        const selected = answers[question.id] === option.id;
                        const isCorrect = result?.correct_option_id === option.id;
                        const showCorrectState = Boolean(result);

                        return (
                          <motion.label
                            key={option.id}
                            whileHover={!isCompleted ? { scale: 1.01 } : {}}
                            whileTap={!isCompleted ? { scale: 0.99 } : {}}
                            transition={{ duration: 0.12 }}
                            className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors ${
                              showCorrectState && isCorrect
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100'
                                : showCorrectState && selected && !isCorrect
                                  ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100'
                                  : selected
                                    ? 'border-reuseai-verde bg-reuseai-verde/10 text-reuseai-preto dark:text-reuseai-branco'
                                    : 'border-reuseai-verde/10 bg-white text-reuseai-cinza hover:border-reuseai-verde/25 dark:border-reuseai-verdeNeon/10 dark:bg-[#101915] dark:text-white/75'
                            } ${isCompleted ? 'cursor-default' : ''}`}
                          >
                            <input
                              type='radio'
                              name={question.id}
                              value={option.id}
                              checked={selected}
                              disabled={isSubmitting || isCompleted}
                              onChange={() =>
                                setAnswers(current => ({
                                  ...current,
                                  [question.id]: option.id,
                                }))
                              }
                              className='h-4 w-4 accent-reuseai-verde'
                            />
                            <span className='flex-1 leading-6'>{option.label}</span>
                            {showCorrectState && isCorrect && (
                              <motion.span variants={scalePop} initial='hidden' animate='visible'>
                                <FontAwesomeIcon
                                  icon={faCircleCheck}
                                  className='text-emerald-500'
                                />
                              </motion.span>
                            )}
                          </motion.label>
                        );
                      })}
                    </div>

                    <AnimatePresence>
                      {result && (
                        <motion.p
                          variants={scalePop}
                          initial='hidden'
                          animate='visible'
                          exit='exit'
                          className={`mt-4 text-sm font-medium ${
                            result.is_correct
                              ? 'text-emerald-700 dark:text-emerald-200'
                              : 'text-red-600 dark:text-red-200'
                          }`}
                        >
                          {result.is_correct
                            ? 'Resposta correta.'
                            : `Resposta certa: ${result.correct_label}.`}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}

              <AnimatePresence>
                {isCompleted && submission && (
                  <motion.div
                    variants={scalePop}
                    initial='hidden'
                    animate='visible'
                    exit='exit'
                    className='rounded-3xl border border-reuseai-verde/15 bg-gradient-to-r from-reuseai-verde/10 via-white to-reuseai-azulClaro/10 px-5 py-4 dark:border-reuseai-verdeNeon/15 dark:from-[#102114] dark:via-[#101915] dark:to-[#10202a]'
                  >
                    <p className='text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                      Quiz concluído com {submission.correct_answers} de{' '}
                      {submission.total_questions} acertos
                    </p>
                    <p className='mt-2 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
                      Você ganhou {submission.xp_gained} XP extras nesta rodada.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {!isCompleted && (
                <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                  <p className='text-sm text-reuseai-cinza dark:text-white/65'>
                    Responda com calma: a ideia aqui é reforçar o que acabou de ser
                    mostrado pela análise.
                  </p>
                  <motion.button
                    type='button'
                    onClick={() => onSubmit(answers)}
                    disabled={!allAnswered || isSubmitting}
                    whileHover={allAnswered && !isSubmitting ? { y: -2 } : {}}
                    whileTap={allAnswered && !isSubmitting ? { scale: 0.97 } : {}}
                    transition={{ duration: 0.15 }}
                    className='inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-reuseai-verde px-5 py-3 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-50'
                  >
                    <FontAwesomeIcon icon={faTrophy} />
                    {isSubmitting ? 'Enviando...' : 'Finalizar quiz'}
                  </motion.button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
