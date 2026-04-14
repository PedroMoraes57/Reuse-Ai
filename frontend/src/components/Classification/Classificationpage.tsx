import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCamera,
  faCircleCheck,
  faLeaf,
  faLocationDot,
  faRecycle,
  faRobot,
  faSeedling,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { UploadPanel, ResultPanel } from '../Classification';
import { analyzeWaste } from '../../services/ClassificationApi';
import type { ClassificationResult } from '../../services/ClassificationApi';

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
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze(file: File) {
    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      const data = await analyzeWaste(file);
      setResult(data);

      if (window.innerWidth <= 900) {
        document.getElementById('result-panel')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível analisar a imagem.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className='bg-reuseai-branco'>
      <section className='relative overflow-hidden bg-gradient-to-br from-reuseai-branco via-reuseai-verdeClaro/10 to-reuseai-azulClaro/10 px-6 py-16'>
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(120,216,78,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(56,182,255,0.12),transparent_32%)]' />
        <div className='absolute -right-20 top-10 h-64 w-64 rounded-full bg-reuseai-verdeClaro/20 blur-3xl' />
        <div className='absolute -left-16 bottom-4 h-56 w-56 rounded-full bg-reuseai-azulClaro/10 blur-3xl' />

        <div className='relative mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] lg:items-center'>
          <div className='max-w-2xl'>
            <span className='inline-flex items-center gap-2 rounded-full border border-reuseai-verde/15 bg-white/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-reuseai-verde shadow-sm backdrop-blur-sm'>
              <FontAwesomeIcon icon={faRecycle} />
              Classificação com IA
            </span>

            <h1 className='mt-6 text-4xl font-black leading-tight text-reuseai-preto md:text-6xl'>
              Descarte certo, com uma experiência mais clara e direta.
            </h1>

            <p className='mt-5 max-w-xl text-base leading-7 text-reuseai-cinza md:text-lg'>
              Envie uma imagem e descubra em segundos como descartar
              corretamente. Identificamos o objeto, analisamos o material e
              mostramos se ele pode ser reciclado, junto com o destino ideal.
            </p>

            <div className='mt-8 flex flex-col gap-4 sm:flex-row'>
              <a
                href='#analisar'
                className='inline-flex items-center justify-center gap-2 rounded-full bg-reuseai-verde px-6 py-3.5 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul'
              >
                <FontAwesomeIcon icon={faCamera} />
                Analisar agora
              </a>
              <a
                href='#como-funciona'
                className='inline-flex items-center justify-center gap-2 rounded-full border border-reuseai-verde/15 bg-white/80 px-6 py-3.5 text-sm font-semibold text-reuseai-preto transition-colors hover:bg-white'
              >
                <FontAwesomeIcon icon={faCircleCheck} />
                Ver como funciona
              </a>
            </div>

            <div className='mt-10 grid gap-4 sm:grid-cols-3'>
              {benefitCards.map(card => (
                <div
                  key={card.title}
                  className='rounded-2xl border border-reuseai-verde/10 bg-white/85 p-4 shadow-[0_24px_50px_-40px_rgba(28,28,37,0.35)] backdrop-blur-sm'
                >
                  <div className='flex h-11 w-11 items-center justify-center rounded-2xl bg-reuseai-verde/10 text-lg text-reuseai-verde'>
                    <FontAwesomeIcon icon={card.icon} />
                  </div>
                  <h2 className='mt-4 text-sm font-bold text-reuseai-preto'>
                    {card.title}
                  </h2>
                  <p className='mt-2 text-sm leading-6 text-reuseai-cinza'>
                    {card.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className='rounded-[32px] border border-reuseai-verde/10 bg-white/90 p-6 shadow-[0_40px_80px_-50px_rgba(28,28,37,0.4)] backdrop-blur-xl'>
            <div className='flex items-center justify-between gap-4'>
              <div>
                <p className='text-xs font-semibold uppercase tracking-[0.28em] text-reuseai-verde'>
                  Fluxo Inteligente
                </p>
                <h2 className='mt-2 text-2xl font-black text-reuseai-preto'>
                  Etapas do uso da nossa classificação com IA
                </h2>
              </div>
              <div className='hidden h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-reuseai-verde/10 text-xl text-reuseai-verde sm:flex'>
                <FontAwesomeIcon icon={faLeaf} />
              </div>
            </div>

            <div className='mt-6 space-y-4'>
              {heroHighlights.map((item, index) => (
                <div
                  key={item.title}
                  className='flex gap-4 rounded-2xl border border-reuseai-verde/10 bg-reuseai-branco p-4'
                >
                  <div className='flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-reuseai-verde/10 text-lg text-reuseai-verde'>
                    <FontAwesomeIcon icon={item.icon} />
                  </div>
                  <div>
                    <p className='text-xs font-semibold uppercase tracking-[0.22em] text-reuseai-cinza/60'>
                      Etapa {index + 1}
                    </p>
                    <h3 className='mt-1 text-base font-bold text-reuseai-preto'>
                      {item.title}
                    </h3>
                    <p className='mt-1 text-sm leading-6 text-reuseai-cinza'>
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className='mt-6 rounded-2xl border border-reuseai-verde/15 bg-reuseai-verde/5 p-5'>
              <p className='text-sm font-semibold text-reuseai-preto'>
                Foque no que importa
              </p>
              <p className='mt-2 text-sm leading-6 text-reuseai-cinza'>
                Veja rapidamente o que é o objeto, se pode ser reciclado e como
                descartar sem erro.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        id='aplicativo'
        className='bg-gradient-to-b from-reuseai-branco via-reuseai-branco to-reuseai-verdeClaro/10 px-6 py-16'
      >
        <div className='mx-auto max-w-6xl'>
          <div className='mb-10 max-w-3xl'>
            <span
              id='analisar'
              className='text-sm font-semibold uppercase tracking-[0.28em] text-reuseai-verde'
            >
              Área de Análise
            </span>
            <h2 className='mt-3 text-3xl font-black text-reuseai-preto md:text-4xl'>
              Envie sua imagem e veja o resultado na hora
            </h2>
            <p className='mt-4 text-sm leading-7 text-reuseai-cinza md:text-base'>
              Tire uma foto ou escolha da galeria para identificar o objeto em
              poucos segundos. A análise mostra o tipo de material, informa se é
              reciclável e orienta exatamente como fazer o descarte correto.
            </p>
          </div>

          {error && (
            <div className='mb-8 flex max-w-3xl items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700'>
              <FontAwesomeIcon
                icon={faTriangleExclamation}
                className='mt-0.5 flex-shrink-0 text-red-500'
              />
              <span>{error}</span>
            </div>
          )}

          <div className='grid items-start gap-7 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]'>
            <UploadPanel onAnalyze={handleAnalyze} isLoading={isLoading} />
            <div id='result-panel'>
              <ResultPanel result={result} isLoading={isLoading} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
