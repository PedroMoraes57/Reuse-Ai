// src/components/classification/ResultPanel.tsx
import type { ClassificationResult } from '../../services/Classificationapi';

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
    <div className='border border-gray-200 rounded-xl overflow-hidden my-1'>
      <div className='bg-gray-50 px-4 py-2.5 text-xs font-bold text-gray-500 flex items-center gap-2 border-b border-gray-200 uppercase tracking-wider'>
        <i className={`${icon} text-green-600 text-sm`} />
        {title}
      </div>
      <p className='px-4 py-3.5 text-sm text-gray-600 leading-relaxed'>
        {text}
      </p>
    </div>
  );
}

export function ResultPanel({ result, isLoading }: ResultPanelProps) {
  return (
    <div className='bg-white border border-gray-200 rounded-2xl p-7 shadow-sm flex flex-col min-h-[400px]'>
      {/* Header */}
      <div className='flex items-start gap-3 mb-6 pb-5 border-b border-gray-200'>
        <span className='w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600 text-base flex-shrink-0'>
          <i className='fas fa-robot' />
        </span>
        <div>
          <h3 className='text-sm font-bold text-gray-900'>Resultado</h3>
          <p className='text-xs text-gray-400'>Orientações de descarte</p>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className='flex-1 flex flex-col items-center justify-center gap-4'>
          <div className='w-12 h-12 border-4 border-green-100 border-t-green-600 rounded-full animate-spin' />
          <p className='text-sm font-semibold text-gray-500'>
            Analisando imagem...
          </p>
        </div>
      )}

      {/* Vazio */}
      {!isLoading && !result && (
        <div className='flex-1 flex flex-col items-center justify-center text-center gap-4 px-6 py-10'>
          <div className='w-18 h-18 w-[72px] h-[72px] bg-green-50 rounded-full flex items-center justify-center text-3xl text-green-200'>
            <i className='fas fa-leaf' />
          </div>
          <p className='text-sm text-gray-400 max-w-[200px] leading-relaxed'>
            Envie uma imagem para ver as orientações de descarte.
          </p>
        </div>
      )}

      {/* Resultado */}
      {!isLoading && result && (
        <div className='flex flex-col gap-2'>
          {/* Chip */}
          <div className='inline-flex items-center gap-2 bg-green-600 text-white text-sm font-bold px-4 py-1.5 rounded-full w-fit mb-1'>
            <i className='fas fa-tag' />
            <span>
              {result.best_match?.display_name_pt || 'Item identificado'}
            </span>
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

          {/* Top previsões */}
          {result.top_predictions?.length > 0 && (
            <div className='border border-gray-200 rounded-xl overflow-hidden my-1'>
              <div className='bg-gray-50 px-4 py-2.5 text-xs font-bold text-gray-500 flex items-center gap-2 border-b border-gray-200 uppercase tracking-wider'>
                <i className='fas fa-chart-bar text-green-600 text-sm' />
                Top previsões
              </div>
              <div className='px-4 py-3.5 flex flex-col gap-2.5'>
                {result.top_predictions.map(p => {
                  const pct = (p.confidence * 100).toFixed(1);
                  return (
                    <div key={p.class_id} className='flex items-center gap-3'>
                      <span className='text-xs font-medium text-gray-600 min-w-[9rem] flex-shrink-0'>
                        {p.display_name_pt || p.class_id}
                      </span>
                      <div className='flex-1 bg-green-50 rounded-full h-1.5 overflow-hidden'>
                        <div
                          className='h-full bg-green-600 rounded-full transition-all duration-500'
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className='text-xs font-bold text-green-600 min-w-[3rem] text-right'>
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Aviso de confiança baixa */}
          {result.uncertain_prediction && (
            <div className='bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-xs text-yellow-800 flex items-center gap-2 mt-1'>
              <i className='fas fa-triangle-exclamation text-yellow-500 flex-shrink-0' />
              Confiança baixa — verifique o resultado com atenção.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
