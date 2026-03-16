import { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import styles from './modules/Navbar.module.css';
import {
  faGear,
  faUser,
  faMoon,
  faSun,
  faRightFromBracket,
} from '@fortawesome/free-solid-svg-icons';
import logo from '../assets/logo.png';

function Navbar() {
  const [menuAberto, setMenuAberto] = useState(false);
  const [configAberto, setConfigAberto] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Listener do clique fora do dropdown
    function handleClickFora(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setConfigAberto(false);
      }
    }

    // Listener do scroll
    function handleScroll() {
      setScrolled(window.scrollY > 50);
    }

    // Adiciona os dois listeners
    document.addEventListener('mousedown', handleClickFora);
    window.addEventListener('scroll', handleScroll);

    // Remove os dois no cleanup
    return () => {
      document.removeEventListener('mousedown', handleClickFora);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 z-[999] ${scrolled ? styles.navScrolled : 'bg-transparent'}`}
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
            className='bg-reuseai-verde hover:bg-reuseai-azul text-reuseai-branco text-sm font-semibold px-5 py-2 rounded-full transition-colors'
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
              <div className='absolute right-0 mt-2 w-48 bg-reuseai-branco rounded-xl shadow-lg border border-gray-200 overflow-hidden'>
                <div className='px-4 py-2 border-b border-gray-100'>
                  <p className='text-xs text-reuseai-preto font-semibold uppercase tracking-wide'>
                    Configurações
                  </p>
                </div>
                <ul className='py-1'>
                  <li>
                    <button className='w-full flex items-center gap-3 px-4 py-2.5 text-sm text-raisin hover:bg-gray-100 transition-colors'>
                      <FontAwesomeIcon
                        icon={faUser}
                        className='text-reuseai-cinza-custom w-4'
                      />
                      Meu perfil
                    </button>
                  </li>
                  <li>
                    <button className='w-full flex items-center gap-3 px-4 py-2.5 text-sm text-raisin hover:bg-gray-100 transition-colors'>
                      <FontAwesomeIcon
                        icon={faSun}
                        className='text-reuseai-cinza-custom w-4'
                      />
                      Tema claro
                    </button>
                  </li>
                  <li>
                    <button className='w-full flex items-center gap-3 px-4 py-2.5 text-sm text-raisin hover:bg-gray-100 transition-colors'>
                      <FontAwesomeIcon
                        icon={faMoon}
                        className='text-reuseai-cinza-custom w-4'
                      />
                      Tema escuro
                    </button>
                  </li>
                  <li className='border-t border-gray-100 mt-1'>
                    <button className='w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors'>
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

        {/* HAMBURGUER mobile */}
        <button
          className='md:hidden flex flex-col gap-1.5 p-2'
          onClick={() => setMenuAberto(!menuAberto)}
        >
          <span className='block w-6 h-0.5 bg-reuseai-branco'></span>
          <span className='block w-6 h-0.5 bg-reuseai-branco'></span>
          <span className='block w-6 h-0.5 bg-reuseai-branco'></span>
        </button>
      </div>

      {/* MENU MOBILE */}
      {menuAberto && (
        <div className='md:hidden bg-reuseai-branco border-t border-white/10 px-6 py-4 flex flex-col gap-4'>
          <a href='#como-funciona' className='text-reuseai-preto text-sm'>
            Como funciona
          </a>
          <a href='#sobre-nos' className='text-reuseai-preto text-sm'>
            Sobre nós
          </a>
          <a href='#aplicativo' className='text-reuseai-preto text-sm'>
            Aplicativo
          </a>
          <a href='#contato' className='text-reuseai-preto text-sm'>
            Contato
          </a>
          <hr className='border-gray' />
          <a href='/login' className='text-reuseai-preto text-sm font-medium'>
            Entrar
          </a>
          <a
            href='/cadastro'
            className='bg-reuseai-verde text-reuseai-branco px-5 py-2 rounded-full text-center text-sm font-semibold'
          >
            Começar grátis
          </a>
        </div>
      )}
    </nav>
  );
}

export default Navbar;
