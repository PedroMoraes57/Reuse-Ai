// src/pages/Classification/ClassificationPage.tsx
import { useState } from 'react';
import { UploadPanel, ResultPanel, StepList } from '../Classification';
import { analyzeWaste } from '../../services/Classificationapi';
import type { ClassificationResult } from '../../services/Classificationapi';

export function ClassificationPage() {
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze(file: File) {
    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      // ⚠️ Chamada real para o Django — ver src/services/classificationApi.ts
      const data = await analyzeWaste(file);
      setResult(data);

      // Scroll suave até o resultado em mobile
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
    <div className='min-h-screen bg-white font-sans'>
      {/* ── HERO ── */}
      <section className='relative bg-white overflow-hidden px-8 py-20 flex items-center justify-center gap-16 min-h-[480px]'>
        {/* Círculos decorativos */}
        <div className='absolute w-[600px] h-[600px] -top-48 -right-36 rounded-full bg-green-600 opacity-[0.06] pointer-events-none' />
        <div className='absolute w-[350px] h-[350px] -bottom-28 -left-20 rounded-full bg-green-600 opacity-[0.06] pointer-events-none' />

        <div className='max-w-[560px] flex-1 relative z-10'>
          <span className='inline-flex items-center gap-1.5 bg-green-50 text-green-600 text-[0.8rem] font-extrabold px-3.5 py-1.5 rounded-full mb-5 uppercase tracking-wider'>
            <i className='fas fa-recycle' /> Reciclagem com IA
          </span>
          <h1 className='text-5xl font-extrabold text-gray-900 leading-tight mb-5'>
            Descarte certo.
            <br />
            <em className='not-italic text-green-600'>Sempre.</em>
          </h1>
          <p className='text-base text-gray-600 leading-relaxed mb-8 max-w-[440px]'>
            Tire uma foto do resíduo e a nossa inteligência artificial indica,
            em segundos, como descartá-lo de forma correta e sustentável.
          </p>
          <a
            href='#analisar'
            className='inline-flex items-center gap-2 bg-green-600 text-white font-bold text-base px-8 py-3.5 rounded-full hover:bg-green-700 hover:-translate-y-0.5 transition-all'
          >
            <i className='fas fa-camera' /> Analisar Agora
          </a>
        </div>

        {/* Card decorativo — oculto em mobile */}
        <div className='flex-shrink-0 relative z-10 hidden md:block'>
          <div className='bg-green-50 border-[1.5px] border-green-100 rounded-2xl p-10 flex flex-col items-center gap-4 text-center max-w-[240px]'>
            <i className='fas fa-recycle text-6xl text-green-600' />
            <span className='text-sm font-semibold text-green-800'>
              Identifica + de 50 tipos de resíduos
            </span>
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section
        id='como-funciona'
        className='bg-gray-50 border-t border-b border-gray-200 py-20 px-4'
      >
        <div className='max-w-5xl mx-auto'>
          <h2 className='text-3xl font-extrabold text-gray-900 text-center mb-3'>
            Como funciona
          </h2>
          <p className='text-gray-400 text-center mb-12'>
            Três passos simples para descartar de forma responsável.
          </p>
          <StepList />
        </div>
      </section>

      {/* ── ANALISAR ── */}
      <section id='analisar' className='py-20 px-4 bg-white'>
        <div className='max-w-5xl mx-auto'>
          <h2 className='text-3xl font-extrabold text-gray-900 text-center mb-3'>
            Analisar resíduo
          </h2>
          <p className='text-gray-400 text-center mb-12'>
            Envie uma foto e descubra como descartar corretamente.
          </p>

          {/* Mensagem de erro */}
          {error && (
            <div className='mb-6 bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center gap-3 text-red-700 text-sm font-medium max-w-2xl mx-auto'>
              <i className='fas fa-circle-exclamation text-red-400 flex-shrink-0' />
              {error}
            </div>
          )}

          {/* Grid upload + resultado */}
          <div className='grid grid-cols-1 md:grid-cols-2 gap-7 items-start'>
            <UploadPanel onAnalyze={handleAnalyze} isLoading={isLoading} />
            <div id='result-panel'>
              <ResultPanel result={result} isLoading={isLoading} />
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className='bg-gray-900 text-gray-400 py-10 border-t border-gray-800'>
        <div className='max-w-5xl mx-auto px-8 flex flex-wrap items-center justify-between gap-6'>
          <div className='flex items-center gap-2 text-white font-extrabold text-lg'>
            <span className='w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center text-white text-sm'>
              <i className='fas fa-leaf' />
            </span>
            Reuse<span className='text-green-500'>.AI</span>
          </div>
          <p className='text-xs text-gray-500'>
            Tecnologia a serviço do planeta. &copy; 2025 Reuse.AI — Todos os
            direitos reservados.
          </p>
          <div className='flex gap-2.5'>
            {[
              { icon: 'fab fa-instagram', href: '#' },
              { icon: 'fab fa-linkedin-in', href: '#' },
              { icon: 'fab fa-whatsapp', href: '#' },
            ].map(({ icon, href }) => (
              <a
                key={icon}
                href={href}
                className='w-9 h-9 bg-gray-800 rounded-full flex items-center justify-center text-white text-sm hover:bg-green-600 transition-colors'
              >
                <i className={icon} />
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
