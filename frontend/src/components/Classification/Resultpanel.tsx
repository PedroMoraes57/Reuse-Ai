import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faBolt,
  faChartColumn,
  faCircleCheck,
  faCircleInfo,
  faLeaf,
  faRecycle,
  faRobot,
  faTag,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { AnimatePresence, motion } from 'framer-motion';
import type { ClassificationResult } from '../../services/ClassificationApi';
import { fadeIn, scalePop, staggerContainer, staggerItem } from '../../utils/animations';

interface ResultPanelProps {
  result: ClassificationResult | null;
  isLoading: boolean;
}

interface InfoBlockProps {
  icon: IconDefinition;
  title: string;
  text: string;
}

function InfoBlock({ icon, title, text }: InfoBlockProps) {
  return (
    <motion.div
      variants={staggerItem}
      className='my-1 overflow-hidden rounded-xl border border-reuseai-verde/10 dark:border-reuseai-verdeNeon/10'
    >
      <div className='flex items-center gap-2 whitespace-nowrap border-b border-reuseai-verde/10 bg-reuseai-verde/5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813] dark:text-white/60'>
        <FontAwesomeIcon icon={icon} className='text-sm text-reuseai-verde' />
        {title}
      </div>
      <p className='px-4 py-3.5 text-sm leading-7 text-reuseai-cinza dark:text-white/70'>
        {text}
      </p>
    </motion.div>
  );
}

export function ResultPanel({ result, isLoading }: ResultPanelProps) {
  const confidenceThreshold = result?.effective_confidence_threshold ?? 0.7;
  const shouldReviewManually = Boolean(
    result &&
      (result.uncertain_prediction || result.confidence < confidenceThreshold),
  );
  const reviewMessage =
    'Verifique este resultado manualmente antes de tomar decisões de descarte ou reciclagem, pois a confiança inicial da análise ficou abaixo do ideal.';

  return (
    <div className='flex min-h-[445px] flex-col rounded-[28px] border border-reuseai-verde/10 bg-white p-7 shadow-[0_30px_60px_-45px_rgba(28,28,37,0.45)] dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]'>
      <div className='mb-6 flex items-start gap-3 border-b border-reuseai-verde/10 pb-5'>
        <span className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-reuseai-verde/10 text-base text-reuseai-verde'>
          <FontAwesomeIcon icon={faRobot} />
        </span>
        <div>
          <h3 className='text-sm font-bold text-reuseai-preto dark:text-reuseai-branco'>
            Resultado
          </h3>
          <p className='text-xs text-reuseai-cinza/70 dark:text-white/55'>
            Orientações de descarte
          </p>
        </div>
      </div>

      <AnimatePresence mode='wait'>
        {isLoading && (
          <motion.div
            key='loading'
            variants={fadeIn}
            initial='hidden'
            animate='visible'
            exit='exit'
            className='flex flex-1 flex-col items-center justify-center gap-4'
          >
            <div className='h-12 w-12 animate-spin rounded-full border-4 border-reuseai-verde/10 border-t-reuseai-verde' />
            <p className='text-sm font-semibold text-reuseai-cinza/80 dark:text-white/65'>
              Analisando imagem...
            </p>
          </motion.div>
        )}

        {!isLoading && !result && (
          <motion.div
            key='empty'
            variants={fadeIn}
            initial='hidden'
            animate='visible'
            exit='exit'
            className='flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center'
          >
            <div className='flex h-[72px] w-[72px] items-center justify-center rounded-full bg-reuseai-verde/10 text-3xl text-reuseai-verde/35'>
              <FontAwesomeIcon icon={faLeaf} />
            </div>
            <p className='max-w-[220px] text-sm leading-7 text-reuseai-cinza/70 dark:text-white/55'>
              Envie uma imagem para ver as orientações de descarte.
            </p>
          </motion.div>
        )}

        {!isLoading && result && (
          <motion.div
            key='result'
            variants={staggerContainer}
            initial='hidden'
            animate='visible'
            className='flex flex-col gap-2'
          >
            <motion.div
              variants={scalePop}
              className='mb-1 inline-flex w-fit items-center gap-2 rounded-full bg-reuseai-verde px-4 py-1.5 text-sm font-bold text-reuseai-branco'
            >
              <FontAwesomeIcon icon={faTag} />
              <span>
                {result.best_match?.display_name_pt || 'Item identificado'}
              </span>
            </motion.div>

            {result.game_update && (
              <motion.div
                variants={staggerItem}
                className='my-1 overflow-hidden rounded-xl border border-reuseai-verde/10 dark:border-reuseai-verdeNeon/10'
              >
                <div className='flex items-center gap-2 whitespace-nowrap border-b border-reuseai-verde/10 bg-reuseai-verde/5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813] dark:text-white/60'>
                  <FontAwesomeIcon
                    icon={faBolt}
                    className='text-sm text-reuseai-verde'
                  />
                  XP desta análise
                </div>

                <div className='px-4 py-4'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <motion.span
                      variants={scalePop}
                      className='rounded-full bg-reuseai-verde px-3 py-1.5 text-xs font-bold text-reuseai-branco'
                    >
                      +{result.game_update.xp_gained} XP
                    </motion.span>
                    <span className='rounded-full border border-reuseai-verde/10 bg-white px-3 py-1.5 text-xs font-semibold text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#101915] dark:text-white/70'>
                      Nível {result.game_update.profile.level}
                    </span>
                    {result.game_update.leveled_up && (
                      <motion.span
                        variants={scalePop}
                        className='rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100'
                      >
                        Subiu de nível
                      </motion.span>
                    )}
                  </div>

                  <div className='mt-4 flex flex-wrap gap-2'>
                    {result.game_update.awards.map(award => (
                      <span
                        key={`${award.label}-${award.amount}`}
                        className='rounded-full border border-reuseai-verde/10 bg-reuseai-verde/5 px-3 py-1.5 text-xs font-medium text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#101915] dark:text-white/70'
                      >
                        {award.label} • +{award.amount} XP
                      </span>
                    ))}
                  </div>

                  <div className='mt-4'>
                    <div className='mb-2 flex items-center justify-between text-xs font-semibold text-reuseai-cinza dark:text-white/65'>
                      <span>Progresso para o próximo nível</span>
                      <span>{result.game_update.profile.progress_percent}%</span>
                    </div>
                    <div className='h-2 overflow-hidden rounded-full bg-reuseai-verde/10'>
                      <motion.div
                        className='h-full rounded-full bg-gradient-to-r from-reuseai-verde to-reuseai-azul'
                        initial={{ width: 0 }}
                        animate={{ width: `${result.game_update.profile.progress_percent}%` }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {result.best_match?.material && (
              <InfoBlock
                icon={faLeaf}
                title='Material principal'
                text={result.best_match.material}
              />
            )}

            {result.best_match?.description_pt && (
              <InfoBlock
                icon={faCircleInfo}
                title='Sobre o item'
                text={result.best_match.description_pt}
              />
            )}

            {result.best_match?.dropoff && (
              <InfoBlock
                icon={faRecycle}
                title='Canal de descarte'
                text={result.best_match.dropoff}
              />
            )}

            {result.best_match?.recommendation && (
              <InfoBlock
                icon={faCircleCheck}
                title='Como descartar'
                text={result.best_match.recommendation}
              />
            )}

            {result.best_match?.preparation && (
              <InfoBlock
                icon={faCircleCheck}
                title='Preparação'
                text={result.best_match.preparation}
              />
            )}

            {typeof result.confidence === 'number' && (
              <motion.div
                variants={staggerItem}
                className='my-1 overflow-hidden rounded-xl border border-reuseai-verde/10 dark:border-reuseai-verdeNeon/10'
              >
                <div className='flex items-center gap-2 whitespace-nowrap border-b border-reuseai-verde/10 bg-reuseai-verde/5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813] dark:text-white/60'>
                  <FontAwesomeIcon
                    icon={faChartColumn}
                    className='text-sm text-reuseai-verde'
                  />
                  Nível de confiança
                </div>
                <div className='flex flex-col gap-2.5 px-4 py-3.5'>
                  <div className='flex items-center gap-3'>
                    <span className='w-20 flex-shrink-0 truncate text-xs font-medium text-reuseai-cinza dark:text-white/65 sm:w-36'>
                      Precisão estimada
                    </span>
                    <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-reuseai-verde/10'>
                      <motion.div
                        className='h-full rounded-full bg-reuseai-verde'
                        initial={{ width: 0 }}
                        animate={{ width: `${(result.confidence * 100).toFixed(1)}%` }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
                      />
                    </div>
                    <span className='min-w-[3rem] text-right text-xs font-bold text-reuseai-verde'>
                      {(result.confidence * 100).toFixed(1)}%
                    </span>
                  </div>

                  {shouldReviewManually && (
                    <div className='rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-100'>
                      {reviewMessage}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {result.uncertain_prediction && (
              <motion.div
                variants={staggerItem}
                className='mt-1 flex gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-100'
              >
                <FontAwesomeIcon
                  icon={faTriangleExclamation}
                  className='mt-0.5 flex-shrink-0 text-yellow-500'
                />
                <div className='space-y-1.5'>
                  <p className='font-semibold'>
                    A IA não atingiu segurança suficiente para cravar esta classe.
                  </p>
                  {result.uncertainty_reasons?.map(reason => (
                    <p key={reason} className='leading-5 text-yellow-900/90 dark:text-yellow-100/85'>
                      • {reason}
                    </p>
                  ))}
                </div>
              </motion.div>
            )}

            {result.uncertain_prediction &&
              result.top_predictions &&
              result.top_predictions.length > 0 && (
              <motion.div
                variants={staggerItem}
                className='my-1 overflow-hidden rounded-xl border border-reuseai-verde/10 dark:border-reuseai-verdeNeon/10'
              >
                <div className='flex items-center gap-2 whitespace-nowrap border-b border-reuseai-verde/10 bg-reuseai-verde/5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-reuseai-cinza dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813] dark:text-white/60'>
                  <FontAwesomeIcon
                    icon={faChartColumn}
                    className='text-sm text-reuseai-verde'
                  />
                  Hipóteses mais prováveis
                </div>
                <div className='flex flex-col gap-2.5 px-4 py-3.5'>
                  {result.top_predictions.map((prediction, idx) => (
                    <div
                      key={prediction.class_id}
                      className='flex items-center gap-3'
                    >
                      <span className='w-20 flex-shrink-0 truncate text-xs font-medium text-reuseai-cinza dark:text-white/65 sm:w-36'>
                        {prediction.display_name_pt || prediction.class_id}
                      </span>
                      <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-reuseai-verde/10'>
                        <motion.div
                          className='h-full rounded-full bg-reuseai-verde'
                          initial={{ width: 0 }}
                          animate={{ width: `${(prediction.confidence * 100).toFixed(1)}%` }}
                          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.3 + idx * 0.07 }}
                        />
                      </div>
                      <span className='min-w-[3rem] text-right text-xs font-bold text-reuseai-verde'>
                        {(prediction.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
