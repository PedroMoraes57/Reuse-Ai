import { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import styles from '../modules/Navbar.module.css';
import {
  faGear,
  faUser,
  faMoon,
  faSun,
  faRightFromBracket,
} from '@fortawesome/free-solid-svg-icons';
import logo from '../../assets/logo.png';
import { useTheme } from '../../contexts/ThemeContext';

interface NavbarProps {
  forceScrolled?: boolean;
  isStatic?: boolean;
}

function Navbar({ forceScrolled = false, isStatic = false }: NavbarProps) {
  const [menuAberto, setMenuAberto] = useState(false);
  const [configAberto, setConfigAberto] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    function handleClickFora(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setConfigAberto(false);
      }
    }

    function handleScroll() {
      setScrolled(window.scrollY > 50);
    }

    document.addEventListener('mousedown', handleClickFora);
    window.addEventListener('scroll', handleScroll);

    return () => {
      document.removeEventListener('mousedown', handleClickFora);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <nav
      className={`${isStatic ? 'relative' : 'fixed top-0 left-0 right-0'} transition-all duration-300 z-[999] ${
        isStatic || forceScrolled || scrolled
          ? styles.navScrolled
          : 'bg-transparent'
      }`}
    >
      <div className='max-w-6xl mx-auto px-6 py-4 flex items-center justify-between'>
        {/* LOGO */}
        <a href='/'>
          <img src={logo} alt='Reuse.AI' className='h-12 w-auto' />
        </a>

        {/* LINKS desktop */}
        <ul className='hidden md:flex items-center gap-8'>
          {[
            { label: 'Como funciona', href: '#como-funciona' },
            { label: 'Sobre nós', href: '#sobre-nos' },
            { label: 'Aplicativo', href: '#aplicativo' },
            { label: 'Contato', href: '#contato' },
          ].map(link => (
            <li key={link.href}>
              <a
                href={link.href}
                className={`${styles.navLink} text-reuseai-branco transition-colors text-sm font-medium`}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* DIREITA */}
        <div className='hidden md:flex items-center gap-3'>
          <a
            href='/login'
            className={`${styles.navLink} text-reuseai-branco transition-colors text-sm font-medium`}
          >
            Entrar
          </a>

          <a
            href='/cadastro'
            className='bg-reuseai-verde hover:bg-reuseai-azul dark:bg-reuseai-verdeEscuro dark:border dark:border-reuseai-verdeNeon/30 dark:hover:bg-[#0c2e42] dark:hover:border-reuseai-azul/60 text-reuseai-branco text-sm font-semibold px-5 py-2 rounded-full transition-colors'
          >
            Começar grátis
          </a>

          {/* CONFIG DROPDOWN */}
          <div className='relative' ref={dropdownRef}>
            <button
              onClick={() => setConfigAberto(!configAberto)}
              className={`${styles.configBtn} w-9 h-9 flex items-center justify-center rounded-full transition-colors text-reuseai-branco`}
            >
              <FontAwesomeIcon icon={faGear} className='text-lg' />
            </button>

            {configAberto && (
              <div className='absolute right-0 mt-2 w-52 bg-reuseai-branco dark:bg-[#111111] rounded-xl shadow-lg border border-gray-200 dark:border-[#333] overflow-hidden'>
                <div className='px-4 py-2 border-b border-gray-100 dark:border-[#222]'>
                  <p className='text-xs text-reuseai-preto dark:text-reuseai-branco font-semibold uppercase tracking-wide'>
                    Configurações
                  </p>
                </div>
                <ul className='py-1'>
                  <li>
                    <button className='w-full flex items-center gap-3 px-4 py-2.5 text-sm text-reuseai-preto dark:text-reuseai-branco hover:bg-gray-100 dark:hover:bg-[#222] transition-colors'>
                      <FontAwesomeIcon
                        icon={faUser}
                        className='text-reuseai-cinza dark:text-[#a0a0a0] w-4'
                      />
                      Meu perfil
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={toggleTheme}
                      className='w-full flex items-center gap-3 px-4 py-2.5 text-sm text-reuseai-preto dark:text-reuseai-branco hover:bg-gray-100 dark:hover:bg-[#222] transition-colors'
                    >
                      <span className={`${styles.themeIconWrapper} w-4 h-4`}>
                        <FontAwesomeIcon
                          icon={faSun}
                          className={`${styles.themeIcon} text-reuseai-cinza dark:text-[#a0a0a0] ${theme === 'dark' ? styles.iconActive : styles.iconInactive}`}
                        />
                        <FontAwesomeIcon
                          icon={faMoon}
                          className={`${styles.themeIcon} text-reuseai-cinza dark:text-[#a0a0a0] ${theme === 'light' ? styles.iconActive : styles.iconInactive}`}
                        />
                      </span>
                      {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
                    </button>
                  </li>
                  <li className='border-t border-gray-100 dark:border-[#222] mt-1'>
                    <button className='w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors'>
                      <FontAwesomeIcon
                        icon={faRightFromBracket}
                        className='w-4'
                      />
                      Sair
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* HAMBURGUER mobile — vira X quando aberto */}
        <button
          className='md:hidden flex flex-col gap-1.5 p-2'
          onClick={() => setMenuAberto(!menuAberto)}
        >
          <span
            className={`block w-6 h-0.5 bg-reuseai-branco transition-all duration-300 ${menuAberto ? 'rotate-45 translate-y-2' : ''}`}
          ></span>
          <span
            className={`block w-6 h-0.5 bg-reuseai-branco transition-all duration-300 ${menuAberto ? 'opacity-0' : ''}`}
          ></span>
          <span
            className={`block w-6 h-0.5 bg-reuseai-branco transition-all duration-300 ${menuAberto ? '-rotate-45 -translate-y-2' : ''}`}
          ></span>
        </button>
      </div>

      {/* MENU MOBILE — animação fluida com max-height */}
      <div
        className={`md:hidden bg-reuseai-branco dark:bg-[#111111] border-t border-white/10 px-6 overflow-hidden ${styles.menuMobile} ${menuAberto ? styles.menuMobileAberto : ''}`}
      >
        <div className='py-4 flex flex-col gap-4'>
          <a
            href='#como-funciona'
            className='text-reuseai-preto dark:text-reuseai-branco text-sm'
          >
            Como funciona
          </a>
          <a
            href='#sobre-nos'
            className='text-reuseai-preto dark:text-reuseai-branco text-sm'
          >
            Sobre nós
          </a>
          <a
            href='#aplicativo'
            className='text-reuseai-preto dark:text-reuseai-branco text-sm'
          >
            Aplicativo
          </a>
          <a
            href='#contato'
            className='text-reuseai-preto dark:text-reuseai-branco text-sm'
          >
            Contato
          </a>
          <hr className='border-gray-200 dark:border-[#333]' />
          <a
            href='/login'
            className='text-reuseai-preto dark:text-reuseai-branco text-sm font-medium'
          >
            Entrar
          </a>

          <button
            onClick={toggleTheme}
            className='flex items-center gap-2 text-reuseai-preto dark:text-reuseai-branco text-sm font-medium'
          >
            <span className={`${styles.themeIconWrapper} w-4 h-4`}>
              <FontAwesomeIcon
                icon={faSun}
                className={`${styles.themeIcon} text-reuseai-cinza dark:text-[#a0a0a0] ${theme === 'dark' ? styles.iconActive : styles.iconInactive}`}
              />
              <FontAwesomeIcon
                icon={faMoon}
                className={`${styles.themeIcon} text-reuseai-cinza dark:text-[#a0a0a0] ${theme === 'light' ? styles.iconActive : styles.iconInactive}`}
              />
            </span>
            {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          </button>

          <a
            href='/cadastro'
            className='bg-reuseai-verde text-reuseai-branco px-5 py-2 rounded-full text-center text-sm font-semibold'
          >
            Começar grátis
          </a>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
