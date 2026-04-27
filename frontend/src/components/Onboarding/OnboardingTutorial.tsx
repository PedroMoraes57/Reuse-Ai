import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faCheck, faXmark } from '@fortawesome/free-solid-svg-icons';
import { getAuthToken } from '../../services/api';
import { me } from '../../services/AuthApi';

function doneKey(userId: number) {
  return `reuseai_tutorial_done_${userId}`;
}

interface Step {
  page: string;
  selector: string | null;
  title: string;
  description: string;
  padding: number;
}

const steps: Step[] = [
  {
    page: '/classificar',
    selector: '#assistant-trigger',
    title: 'Assistente de IA',
    description:
      'Seu assistente pessoal disponível em todas as páginas. Após analisar um objeto, ele explica o resultado, responde suas dúvidas e sugere as melhores alternativas de descarte.',
    padding: 14,
  },
  {
    page: '/classificar',
    selector: '[data-tutorial="upload-panel"]',
    title: 'Classificação com IA',
    description:
      'O coração da plataforma. Envie uma foto e a IA identifica o objeto, informa o material, se é reciclável e orienta como e onde descartar corretamente na sua cidade — tudo em segundos.',
    padding: 16,
  },
  {
    page: '/ranking',
    selector: '[data-tutorial="ranking-leaderboard"]',
    title: 'Ranking Semanal',
    description:
      'Compare seu desempenho com a comunidade. O ranking é zerado toda segunda-feira — quanto mais você analisa e recicla, mais XP acumula e mais alto você aparece na lista.',
    padding: 16,
  },
  {
    page: '/amigos',
    selector: '[data-tutorial="friends-hero"]',
    title: 'Amigos e Batalhas',
    description:
      'Construa sua rede: encontre amigos pelo username, adicione-os e desafie-os para batalhas de reciclagem em tempo real. Quem acertar mais questões leva o título de mais sustentável!',
    padding: 16,
  },
  {
    page: '/classificar',
    selector: null,
    title: 'Tudo pronto para começar!',
    description:
      'Você já conhece o Reuse.AI. Envie sua primeira imagem agora — cada análise rende XP, sobe seu nível e contribui para um planeta mais sustentável.',
    padding: 0,
  },
];

interface SpotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TOOLTIP_EST_H = 210;
const TOOLTIP_GAP = 24;

function calcTipStyle(
  spot: SpotRect,
  vpW: number,
  vpH: number,
  TW: number,
): React.CSSProperties {
  // Clamp spot bounds to viewport
  const visTop = Math.max(0, spot.y);
  const visBottom = Math.min(vpH, spot.y + spot.h);

  const spaceBelow = vpH - visBottom;
  const spaceAbove = visTop;

  let left = spot.x + spot.w / 2 - TW / 2;
  left = Math.max(16, Math.min(left, vpW - TW - 16));

  if (spaceBelow >= TOOLTIP_EST_H + TOOLTIP_GAP) {
    return { top: visBottom + TOOLTIP_GAP, left, width: TW };
  }
  if (spaceAbove >= TOOLTIP_EST_H + TOOLTIP_GAP) {
    return { top: Math.max(8, visTop - TOOLTIP_GAP - TOOLTIP_EST_H), left, width: TW };
  }
  // Neither fits cleanly — anchor to whichever side has more room
  if (spaceBelow >= spaceAbove) {
    return { top: Math.min(visBottom + TOOLTIP_GAP, vpH - TOOLTIP_EST_H - 8), left, width: TW };
  }
  return { top: Math.max(8, visTop - TOOLTIP_EST_H - TOOLTIP_GAP), left, width: TW };
}

export default function OnboardingTutorial() {
  const [visible, setVisible] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [spot, setSpot] = useState<SpotRect | null>(null);
  const [ready, setReady] = useState(false);
  const [vpW, setVpW] = useState(window.innerWidth);
  const [vpH, setVpH] = useState(window.innerHeight);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Check per-user: fetch identity then decide whether to show
  useEffect(() => {
    if (!getAuthToken()) return;
    me()
      .then(user => {
        if (!localStorage.getItem(doneKey(user.id))) {
          setUserId(user.id);
          setVisible(true);
        }
      })
      .catch(() => {});
  }, []);

  // Track viewport size
  useEffect(() => {
    const update = () => {
      setVpW(window.innerWidth);
      setVpH(window.innerHeight);
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const step = steps[stepIndex];

  // Navigate to correct page when step changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!visible) return;
    if (location.pathname !== step.page) navigate(step.page);
  }, [visible, stepIndex]);

  // Find target element once on the correct page
  useEffect(() => {
    if (!visible || location.pathname !== step.page) return;

    setSpot(null);
    setReady(false);

    if (!step.selector) {
      setReady(true);
      return;
    }

    let cancelled = false;
    let attempts = 0;

    function measure(el: Element) {
      const r = el.getBoundingClientRect();
      setSpot({
        x: Math.round(r.left - step.padding),
        y: Math.round(r.top - step.padding),
        w: Math.round(r.width + step.padding * 2),
        h: Math.round(r.height + step.padding * 2),
      });
      setReady(true);
    }

    function tryFind() {
      if (cancelled) return;
      attempts++;
      const el = document.querySelector(step.selector!);
      if (el) {
        // Instant scroll so position is stable when we measure
        el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'nearest' });
        // Brief repaint delay
        timerRef.current = setTimeout(() => {
          if (cancelled) return;
          const el2 = document.querySelector(step.selector!);
          if (el2) measure(el2);
        }, 80);
        return;
      }
      if (attempts < 60) {
        timerRef.current = setTimeout(tryFind, 80);
      } else {
        // Give up — show tooltip without spotlight
        setReady(true);
      }
    }

    // Reset scroll first so the page is in a known position
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    timerRef.current = setTimeout(tryFind, 200);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, stepIndex, location.pathname]);

  // Lock body scroll while spotlight is active
  useEffect(() => {
    if (visible && ready) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [visible, ready]);

  // Keep spotlight position updated on scroll / resize
  useEffect(() => {
    if (!visible || !ready || !step.selector) return;
    const update = () => {
      const el = document.querySelector(step.selector!);
      if (el) {
        const r = el.getBoundingClientRect();
        setSpot({
          x: Math.round(r.left - step.padding),
          y: Math.round(r.top - step.padding),
          w: Math.round(r.width + step.padding * 2),
          h: Math.round(r.height + step.padding * 2),
        });
      }
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [visible, ready, step.selector, step.padding]);

  function dismiss() {
    if (userId !== null) localStorage.setItem(doneKey(userId), '1');
    setVisible(false);
    if (location.pathname !== '/classificar') navigate('/classificar');
  }

  function advance() {
    if (stepIndex < steps.length - 1) {
      setReady(false);
      setSpot(null);
      setStepIndex(i => i + 1);
    } else {
      dismiss();
    }
  }

  if (!visible) return null;

  const isCentered = step.selector === null;
  const isLast = stepIndex === steps.length - 1;
  const TW = Math.min(360, vpW - 32);
  const tipStyle = spot ? calcTipStyle(spot, vpW, vpH, TW) : undefined;

  const tooltipCard = (
    <div className='rounded-2xl border border-reuseai-verde/25 bg-white p-5 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.55)] dark:border-reuseai-verdeNeon/25 dark:bg-[#0f1a13]'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='text-[0.6rem] font-bold uppercase tracking-widest text-reuseai-verde'>
            {stepIndex + 1} de {steps.length}
          </p>
          <h3 className='mt-1 text-base font-black text-reuseai-preto dark:text-reuseai-branco'>
            {step.title}
          </h3>
        </div>
        <button
          onClick={dismiss}
          className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-reuseai-cinza transition-colors hover:bg-black/10 hover:text-reuseai-preto dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white'
          aria-label='Pular tutorial'
        >
          <FontAwesomeIcon icon={faXmark} className='text-[11px]' />
        </button>
      </div>

      <p className='mt-2 text-sm leading-relaxed text-reuseai-cinza dark:text-white/70'>
        {step.description}
      </p>

      <div className='mt-4 flex items-center justify-between gap-2'>
        <div className='flex gap-1'>
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === stepIndex
                  ? 'w-4 bg-reuseai-verde'
                  : i < stepIndex
                    ? 'w-1.5 bg-reuseai-verde/35'
                    : 'w-1.5 bg-gray-200 dark:bg-white/15'
              }`}
            />
          ))}
        </div>
        <button
          onClick={advance}
          className='inline-flex items-center gap-1.5 rounded-full bg-reuseai-verde px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-reuseai-azul'
        >
          {isLast ? (
            <>
              <FontAwesomeIcon icon={faCheck} className='text-[10px]' />
              Começar
            </>
          ) : (
            <>
              Próximo
              <FontAwesomeIcon icon={faArrowRight} className='text-[10px]' />
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Interaction blocker — only active when spotlight is visible */}
      {ready && (
        <div
          className='fixed inset-0 z-[9990]'
          style={{ cursor: 'default' }}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        />
      )}

      {/* SVG overlay with spotlight cutout */}
      {ready && !isCentered && (
        <svg
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: vpW,
            height: vpH,
            zIndex: 9991,
            pointerEvents: 'none',
          }}
        >
          <defs>
            <mask id='tutorial-spotlight-mask'>
              <rect fill='white' x={0} y={0} width={vpW} height={vpH} />
              {spot && (
                <rect
                  fill='black'
                  x={spot.x}
                  y={spot.y}
                  width={spot.w}
                  height={spot.h}
                  rx={14}
                />
              )}
            </mask>
          </defs>

          <rect
            fill='rgba(0,0,0,0.78)'
            x={0}
            y={0}
            width={vpW}
            height={vpH}
            mask='url(#tutorial-spotlight-mask)'
          />

          {spot && (
            <rect
              fill='none'
              stroke='rgba(120,216,78,0.8)'
              strokeWidth={2}
              x={spot.x}
              y={spot.y}
              width={spot.w}
              height={spot.h}
              rx={14}
            />
          )}
        </svg>
      )}

      {/* Full-screen overlay for centered final step */}
      {ready && isCentered && (
        <div
          className='fixed inset-0 z-[9991]'
          style={{ background: 'rgba(0,0,0,0.78)', pointerEvents: 'none' }}
        />
      )}

      {/* Single AnimatePresence — prevents overlapping exit/enter animations */}
      <AnimatePresence mode='wait'>
        {ready && !isCentered && (
          <motion.div
            key={`tip-${stepIndex}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            style={{ position: 'fixed', zIndex: 9995, ...(tipStyle ?? { bottom: 24, left: '50%', transform: 'translateX(-50%)', width: TW }) }}
          >
            {tooltipCard}
          </motion.div>
        )}

        {ready && isCentered && (
          <motion.div
            key={`centered-${stepIndex}`}
            className='fixed inset-0 z-[9995] flex items-center justify-center p-4'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ pointerEvents: 'none' }}
          >
            <motion.div
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.94 }}
              transition={{ duration: 0.2 }}
              style={{ width: TW, pointerEvents: 'all' }}
            >
              {tooltipCard}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading indicator — only while finding element (page is still visible) */}
      {!ready && (
        <div className='fixed bottom-6 left-1/2 z-[9995] -translate-x-1/2'>
          <div className='flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm'>
            <div className='h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white' />
            Carregando tutorial...
          </div>
        </div>
      )}
    </>
  );
}
