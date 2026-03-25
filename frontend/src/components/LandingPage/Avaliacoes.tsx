import { useState, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faStar,
  faChevronLeft,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons';
import styles from '../modules/Avaliacoes.module.css';

const avaliacoes = [
  {
    id: 1,
    titulo: 'A IA está perfeita!',
    texto:
      'Nunca soube onde jogar minha embalagem de isopor. Com a Reuse.AI fotografei e em segundos tive a resposta certa. Simples e incrível!',
    nome: 'Leonardo Jordão Granata',
    foto: 'https://i.pravatar.cc/150?img=11',
    estrelas: 5,
  },
  {
    id: 2,
    titulo: 'Agora sei onde descartar minhas baterias!',
    texto:
      'Sempre tive dúvida sobre pilhas e baterias. A plataforma me indicou um ponto de coleta a 500m de casa. Recomendo muito!',
    nome: 'Matheus Costa',
    foto: 'https://i.pravatar.cc/150?img=33',
    estrelas: 5,
  },
  {
    id: 3,
    titulo: 'Lixeira amarela para metal!',
    texto:
      'Aprendi que lata de alumínio vai na lixeira amarela e não na vermelha. Pequeno detalhe que faz grande diferença.',
    nome: 'Luis Gustavo da Rocha',
    foto: 'https://i.pravatar.cc/150?img=57',
    estrelas: 5,
  },
  {
    id: 4,
    titulo: 'Mudou minha rotina!',
    texto:
      'Uso todo dia antes de jogar qualquer coisa fora. Minha família inteira adotou o aplicativo. É rápido e fácil!',
    nome: 'Ana Paula Ferreira',
    foto: 'https://i.pravatar.cc/150?img=47',
    estrelas: 5,
  },
  {
    id: 5,
    titulo: 'Incrível para ensinar as crianças!',
    texto:
      'Meus filhos adoraram fotografar os objetos e descobrir onde descartar. Virou uma brincadeira educativa em casa!',
    nome: 'Carla Mendonça',
    foto: 'https://i.pravatar.cc/150?img=5',
    estrelas: 5,
  },
];

function Avaliacoes() {
  const [inicio, setInicio] = useState(0);
  const touchStartX = useRef(0);

  // No desktop mostra 3, no mobile 1
  const isMobile = window.innerWidth <= 768;
  const visiveis = isMobile ? 1 : 3;

  // Largura de cada card + gap em px
  const cardWidthPercent = isMobile ? 85 : 33.333;
  const gapPx = 24;

  function next() {
    if (inicio + visiveis < avaliacoes.length) setInicio(i => i + 1);
  }

  function prev() {
    if (inicio > 0) setInicio(i => i - 1);
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      diff > 0 ? next() : prev();
    }
  }

  // Calcula o deslocamento do trilho
  const deslocamento = `calc(-${inicio * cardWidthPercent}% - ${inicio * gapPx}px)`;

  return (
    <section className={styles.section}>
      <div className='max-w-6xl mx-auto'>
        {/* Título */}
        <h2 className='text-4xl md:text-5xl font-black text-reuseai-branco mb-12 text-center'>
          O que dizem sobre a{' '}
          <span className='text-reuseai-verdeNeon'>Reuse.AI</span>
        </h2>
        <p
          className={`${styles.paragrafoCelular} text-center mt-[-30px] mb-[30px] text-[12px] text-reuseai-branco`}
        >
          Arraste para o lado para ver as avaliações.
        </p>

        {/* Carrossel */}
        <div className='flex items-center gap-4'>
          <button
            className={styles.seta}
            onClick={prev}
            disabled={inicio === 0}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>

          <div
            className={styles.carrosselWrapper}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className={styles.carrosselTrilho}
              style={{ transform: `translateX(${deslocamento})` }}
            >
              {avaliacoes.map(av => (
                <div key={av.id} className={styles.card}>
                  <div className={styles.estrelas}>
                    {Array.from({ length: av.estrelas }).map((_, s) => (
                      <FontAwesomeIcon key={s} icon={faStar} />
                    ))}
                  </div>

                  <h3 className='text-reuseai-branco font-bold text-base'>
                    {av.titulo}
                  </h3>

                  <p className='text-reuseai-branco/60 text-sm leading-relaxed flex-1'>
                    {av.texto}
                  </p>

                  <div className={styles.autorDivider}>
                    <img
                      src={av.foto}
                      alt={av.nome}
                      className={styles.avatar}
                    />
                    <span className='text-reuseai-branco text-sm font-semibold'>
                      {av.nome}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            className={styles.seta}
            onClick={next}
            disabled={inicio + visiveis >= avaliacoes.length}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
      </div>
    </section>
  );
}

export default Avaliacoes;
