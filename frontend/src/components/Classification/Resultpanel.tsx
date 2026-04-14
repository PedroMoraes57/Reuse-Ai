import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faChartColumn,
  faCircleCheck,
  faCircleInfo,
  faLeaf,
  faRecycle,
  faRobot,
  faTag,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import type { ClassificationResult } from '../../services/ClassificationApi';

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
    <div className='my-1 overflow-hidden rounded-xl border border-reuseai-verde/10'>
      <div className='flex items-center gap-2 border-b border-reuseai-verde/10 bg-reuseai-verde/5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-reuseai-cinza'>
        <FontAwesomeIcon icon={icon} className='text-sm text-reuseai-verde' />
        {title}
      </div>
      <p className='px-4 py-3.5 text-sm leading-7 text-reuseai-cinza'>{text}</p>
    </div>
  );
}

export function ResultPanel({ result, isLoading }: ResultPanelProps) {
  return (
    <div className='flex min-h-[445px] flex-col rounded-[28px] border border-reuseai-verde/10 bg-white p-7 shadow-[0_30px_60px_-45px_rgba(28,28,37,0.45)]'>
      <div className='mb-6 flex items-start gap-3 border-b border-reuseai-verde/10 pb-5'>
        <span className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-reuseai-verde/10 text-base text-reuseai-verde'>
          <FontAwesomeIcon icon={faRobot} />
        </span>
        <div>
          <h3 className='text-sm font-bold text-reuseai-preto'>Resultado</h3>
          <p className='text-xs text-reuseai-cinza/70'>
            Orientações de descarte
          </p>
        </div>
      </div>

      {isLoading && (
        <div className='flex flex-1 flex-col items-center justify-center gap-4'>
          <div className='h-12 w-12 animate-spin rounded-full border-4 border-reuseai-verde/10 border-t-reuseai-verde' />
          <p className='text-sm font-semibold text-reuseai-cinza/80'>
            Analisando imagem...
          </p>
        </div>
      )}

      {!isLoading && !result && (
        <div className='flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center'>
          <div className='flex h-[72px] w-[72px] items-center justify-center rounded-full bg-reuseai-verde/10 text-3xl text-reuseai-verde/35'>
            <FontAwesomeIcon icon={faLeaf} />
          </div>
          <p className='max-w-[220px] text-sm leading-7 text-reuseai-cinza/70'>
            Envie uma imagem para ver as orientações de descarte.
          </p>
        </div>
      )}

      {!isLoading && result && (
        <div className='flex flex-col gap-2'>
          <div className='mb-1 inline-flex w-fit items-center gap-2 rounded-full bg-reuseai-verde px-4 py-1.5 text-sm font-bold text-reuseai-branco'>
            <FontAwesomeIcon icon={faTag} />
            <span>
              {result.best_match?.display_name_pt || 'Item identificado'}
            </span>
          </div>

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

          {typeof result.confidence === 'number' && (
            <div className='my-1 overflow-hidden rounded-xl border border-reuseai-verde/10'>
              <div className='flex items-center gap-2 border-b border-reuseai-verde/10 bg-reuseai-verde/5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-reuseai-cinza'>
                <FontAwesomeIcon
                  icon={faChartColumn}
                  className='text-sm text-reuseai-verde'
                />
                Nível de confiança
              </div>
              <div className='flex flex-col gap-2.5 px-4 py-3.5'>
                <div className='flex items-center gap-3'>
                  <span className='min-w-[9rem] flex-shrink-0 text-xs font-medium text-reuseai-cinza'>
                    Precisão estimada
                  </span>
                  <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-reuseai-verde/10'>
                    <div
                      className='h-full rounded-full bg-reuseai-verde transition-all duration-500'
                      style={{
                        width: `${(result.confidence * 100).toFixed(1)}%`,
                      }}
                    />
                  </div>
                  <span className='min-w-[3rem] text-right text-xs font-bold text-reuseai-verde'>
                    {(result.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {result.uncertain_prediction && (
            <div className='mt-1 flex gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs text-yellow-800'>
              <FontAwesomeIcon
                icon={faTriangleExclamation}
                className='mt-0.5 flex-shrink-0 text-yellow-500'
              />
              <div className='space-y-1.5'>
                <p className='font-semibold'>
                  A IA não atingiu segurança suficiente para cravar esta classe.
                </p>
                {result.uncertainty_reasons?.map(reason => (
                  <p key={reason} className='leading-5 text-yellow-900/90'>
                    • {reason}
                  </p>
                ))}
              </div>
            </div>
          )}

          {result.top_predictions && result.top_predictions.length > 0 && (
            <div className='my-1 overflow-hidden rounded-xl border border-reuseai-verde/10'>
              <div className='flex items-center gap-2 border-b border-reuseai-verde/10 bg-reuseai-verde/5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-reuseai-cinza'>
                <FontAwesomeIcon
                  icon={faChartColumn}
                  className='text-sm text-reuseai-verde'
                />
                Hipóteses mais prováveis
              </div>
              <div className='flex flex-col gap-2.5 px-4 py-3.5'>
                {result.top_predictions.map(prediction => (
                  <div
                    key={prediction.class_id}
                    className='flex items-center gap-3'
                  >
                    <span className='min-w-[9rem] flex-shrink-0 text-xs font-medium text-reuseai-cinza'>
                      {prediction.display_name_pt || prediction.class_id}
                    </span>
                    <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-reuseai-verde/10'>
                      <div
                        className='h-full rounded-full bg-reuseai-verde transition-all duration-500'
                        style={{
                          width: `${(prediction.confidence * 100).toFixed(1)}%`,
                        }}
                      />
                    </div>
                    <span className='min-w-[3rem] text-right text-xs font-bold text-reuseai-verde'>
                      {(prediction.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
