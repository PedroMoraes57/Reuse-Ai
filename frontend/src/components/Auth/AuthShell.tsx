import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faMoon, faSun } from '@fortawesome/free-solid-svg-icons';
import { motion } from 'framer-motion';
import logo from '../../assets/logo.png';
import { useTheme } from '../../contexts/ThemeContext';
import { staggerContainer, staggerItem } from '../../utils/animations';

interface HighlightItem {
  title: string;
  description: string;
}

interface AuthShellProps {
  badge: string;
  title: string;
  description: string;
  highlights: HighlightItem[];
  children: ReactNode;
  footer?: ReactNode;
  layout?: 'login' | 'register' | 'default';
}

export function AuthShell({
  badge,
  title,
  description,
  highlights,
  children,
  footer,
  layout = 'default',
}: AuthShellProps) {
  const isLoginLayout = layout === 'login';
  const isRegisterLayout = layout === 'register';
  const useAuthLeftLayout = isLoginLayout || isRegisterLayout;
  const { theme, toggleTheme } = useTheme();

  const orderedHighlights = isLoginLayout
    ? [
        highlights.find(h => h.title === 'Confirmação por e-mail') || highlights[1],
        highlights.find(h => h.title === 'Acesso protegido') || highlights[0],
        highlights.find(h => h.title === 'Entrada rápida') || highlights[2],
      ].filter(Boolean)
    : highlights;

  const leftSectionClass = useAuthLeftLayout
    ? 'flex flex-col min-w-0 w-full self-start rounded-[34px] bg-reuseai-preto px-4 py-5 text-reuseai-branco shadow-[0_45px_120px_-65px_rgba(28,28,37,0.8)] sm:px-6 sm:py-6 md:px-7 md:py-7 lg:self-center'
    : 'flex h-full flex-col min-w-0 w-full rounded-[34px] bg-reuseai-preto px-4 py-5 text-reuseai-branco shadow-[0_45px_120px_-65px_rgba(28,28,37,0.8)] sm:px-6 sm:py-6 md:px-7 md:py-7';

  const titleDivClass = 'max-w-lg mt-6 hidden lg:block';

  const highlightsDivClass = useAuthLeftLayout
    ? 'mt-8 hidden lg:grid gap-4 lg:grid-cols-2 lg:auto-rows-auto'
    : 'grid gap-5 min-h-0 mt-0 flex-1 md:gap-5 md:grid-cols-2';

  const highlightItemClass = (index: number) => {
    let className = 'rounded-[24px] border border-white/8 bg-white/6 p-5 backdrop-blur-sm';

    if (useAuthLeftLayout) {
      if (index === 0) {
        className += ' md:col-span-2 min-h-[150px]';
      } else {
        className += ' min-h-[210px]';
      }
    } else {
      className += ' md:col-span-1';
    }

    return className;
  };

  const rightSectionClass = isLoginLayout
    ? 'flex min-w-0 w-full self-start rounded-[34px] border border-reuseai-verde/10 bg-white/92 p-4 shadow-[0_45px_120px_-70px_rgba(28,28,37,0.45)] backdrop-blur-xl dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/92 sm:p-6 md:p-8 lg:self-center'
    : 'flex flex-1 flex-col min-h-0 min-w-0 w-full rounded-[34px] border border-reuseai-verde/10 bg-white/92 p-4 shadow-[0_45px_120px_-70px_rgba(28,28,37,0.45)] backdrop-blur-xl dark:border-reuseai-verdeNeon/10 dark:bg-[#101915]/92 sm:p-6 md:p-7';

  return (
    <main className="relative flex min-h-[100dvh] items-center overflow-y-auto overflow-x-clip bg-gradient-to-br from-reuseai-branco via-reuseai-verdeClaro/10 to-reuseai-azulClaro/10 px-3 py-4 dark:from-[#08110a] dark:via-[#0e1711] dark:to-[#0d1721] sm:px-6 sm:py-5 md:py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(120,216,78,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(56,182,255,0.12),transparent_34%)]" />
      <div className="absolute -left-24 top-8 h-64 w-64 rounded-full bg-reuseai-verdeClaro/20 blur-3xl" />
      <div className="absolute -right-20 bottom-6 h-72 w-72 rounded-full bg-reuseai-azulClaro/10 blur-3xl" />

      <div className="relative mx-auto grid w-full max-w-[1120px] content-start gap-4 sm:gap-6 lg:grid-cols-2 lg:items-center">
        <motion.section
          className={leftSectionClass}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-start justify-between gap-3 sm:items-center sm:gap-4">
            <Link
              to="/"
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-reuseai-branco transition-colors hover:bg-white/10 sm:gap-3 sm:px-4"
            >
              <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
              <span className="hidden min-[380px]:inline">Voltar ao início</span>
              <span className="min-[380px]:hidden">Voltar</span>
            </Link>

            <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-reuseai-branco transition-colors hover:bg-white/10 sm:h-11 sm:w-11"
                aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
                title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
              >
                <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
              </button>
              <div className="flex min-w-0 justify-end">
                <img
                  src={logo}
                  alt="Reuse.AI"
                  className="h-8 w-auto max-w-[110px] object-contain sm:h-10 sm:max-w-[138px] md:h-11 md:max-w-[152px]"
                />
              </div>
            </div>
          </div>

          <div className={titleDivClass}>
            <span className="inline-flex rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-reuseai-verdeClaro">
              {badge}
            </span>

            <h1 className="mt-5 text-[2rem] font-black leading-tight md:text-[2.2rem]">
              {title}
            </h1>

            <p className="mt-4 max-w-lg text-sm leading-6 text-white/78 md:text-[15px]">
              {description}
            </p>
          </div>

          <motion.div
            className={highlightsDivClass}
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {orderedHighlights.map((item, index) => (
              <motion.div key={index} className={highlightItemClass(index)} variants={staggerItem}>
                <div className="h-1.5 w-16 rounded-full bg-reuseai-verdeClaro/70" />
                <h2 className="mt-4 text-base font-bold text-white">
                  {item.title}
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-white/72">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        <motion.section
          className={rightSectionClass}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
        >
          <div className="w-full">
            {children}
            {footer && <div className="mt-7">{footer}</div>}
          </div>
        </motion.section>
      </div>
    </main>
  );
}
