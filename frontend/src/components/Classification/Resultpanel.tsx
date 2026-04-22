import type { ClassificationResult } from '../../services/ClassificationApi';
import { useAssistant } from '../../contexts/useAssistant';

interface ResultPanelProps {
  result: ClassificationResult | null;
  isLoading: boolean;
}

interface InfoBlockProps {
  icon: string;
  title: string;
  text: string;
}

function InfoBlock({ icon, title, text }: InfoBlockProps) {
  return (
    <div className='my-1 overflow-hidden rounded-xl border border-gray-200'>
      <div className='flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-500'>
        <i className={`${icon} text-sm text-green-600`} />
        {title}
      </div>
      <p className='px-4 py-3.5 text-sm leading-relaxed text-gray-600'>{text}</p>
    </div>
  );
}

export function ResultPanel({ result, isLoading }: ResultPanelProps) {
  const { askQuickQuestion } = useAssistant();

  return (
    <div className='flex min-h-[400px] flex-col rounded-2xl border border-gray-200 bg-white p-7 shadow-sm'>
      <div className='mb-6 flex items-start gap-3 border-b border-gray-200 pb-5'>
        <span className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-green-50 text-base text-green-600'>
          <i className='fas fa-robot' />
        </span>
        <div>
          <h3 className='text-sm font-bold text-gray-900'>Resultado</h3>
          <p className='text-xs text-gray-400'>Orientacoes de descarte</p>
        </div>
      </div>

      {isLoading && (
        <div className='flex flex-1 flex-col items-center justify-center gap-4'>
          <div className='h-12 w-12 animate-spin rounded-full border-4 border-green-100 border-t-green-600' />
          <p className='text-sm font-semibold text-gray-500'>
            Analisando imagem...
          </p>
        </div>
      )}

      {!isLoading && !result && (
        <div className='flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center'>
          <div className='flex h-[72px] w-[72px] items-center justify-center rounded-full bg-green-50 text-3xl text-green-200'>
            <i className='fas fa-leaf' />
          </div>
          <p className='max-w-[200px] text-sm leading-relaxed text-gray-400'>
            Envie uma imagem para ver as orientacoes de descarte.
          </p>
        </div>
      )}

      {!isLoading && result && (
        <div className='flex flex-col gap-2'>
          <div className='mb-1 inline-flex w-fit items-center gap-2 rounded-full bg-green-600 px-4 py-1.5 text-sm font-bold text-white'>
            <i className='fas fa-tag' />
            <span>{result.best_match?.display_name_pt || 'Item identificado'}</span>
          </div>

          {result.best_match?.description_pt && (
            <InfoBlock
              icon='fas fa-info-circle'
              title='Sobre o item'
              text={result.best_match.description_pt}
            />
          )}

          {result.best_match?.dropoff && (
            <InfoBlock
              icon='fas fa-recycle'
              title='Canal de descarte'
              text={result.best_match.dropoff}
            />
          )}

          {result.best_match?.recommendation && (
            <InfoBlock
              icon='fas fa-clipboard-check'
              title='Como descartar'
              text={result.best_match.recommendation}
            />
          )}

          {result.best_match?.preparation && (
            <InfoBlock
              icon='fas fa-soap'
              title='Preparacao'
              text={result.best_match.preparation}
            />
          )}

          <div className='mt-2 rounded-2xl border border-green-200 bg-green-50/70 p-4'>
            <div className='flex items-start gap-3'>
              <span className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white text-green-600 shadow-sm'>
                <i className='fas fa-comments' />
              </span>
              <div className='flex-1'>
                <h4 className='text-sm font-bold text-gray-900'>
                  Tire uma duvida sem sair do fluxo
                </h4>
                <p className='mt-1 text-xs text-gray-600'>
                  O assistente usa este resultado para responder de forma mais
                  direta.
                </p>
                <div className='mt-3 flex flex-wrap gap-2'>
                  {[
                    'O que eu faco com isso?',
                    'Onde descartar esse item?',
                    'Por que esse item nao vai na reciclavel?',
                    'Como preparar antes de descartar?',
                  ].map(question => (
                    <button
                      key={question}
                      type='button'
                      onClick={() => {
                        void askQuickQuestion(question);
                      }}
                      className='rounded-full border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100'
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {result.top_predictions?.length > 0 && (
            <div className='my-1 overflow-hidden rounded-xl border border-gray-200'>
              <div className='flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-500'>
                <i className='fas fa-chart-bar text-sm text-green-600' />
                Top previsoes
              </div>
              <div className='flex flex-col gap-2.5 px-4 py-3.5'>
                {result.top_predictions.map(prediction => {
                  const pct = (prediction.confidence * 100).toFixed(1);
                  return (
                    <div
                      key={prediction.class_id}
                      className='flex items-center gap-3'
                    >
                      <span className='min-w-[9rem] flex-shrink-0 text-xs font-medium text-gray-600'>
                        {prediction.display_name_pt || prediction.class_id}
                      </span>
                      <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-green-50'>
                        <div
                          className='h-full rounded-full bg-green-600 transition-all duration-500'
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className='min-w-[3rem] text-right text-xs font-bold text-green-600'>
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {result.uncertain_prediction && (
            <div className='mt-1 flex items-center gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs text-yellow-800'>
              <i className='fas fa-triangle-exclamation flex-shrink-0 text-yellow-500' />
              Confianca baixa. Verifique o resultado com atencao.
            </div>
          )}

          {result.best_match?.region_notes?.length > 0 && (
            <div className='my-1 overflow-hidden rounded-xl border border-gray-200'>
              <div className='flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-500'>
                <i className='fas fa-location-dot text-sm text-green-600' />
                Observacoes da regiao
              </div>
              <div className='flex flex-col gap-2 px-4 py-3.5 text-sm text-gray-600'>
                {result.best_match.region_notes.map(note => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
