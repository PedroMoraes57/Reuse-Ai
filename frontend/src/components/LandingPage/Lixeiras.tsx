import { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBottleWater,
  faNewspaper,
  faWineBottle,
  faLeaf,
  faWhiskeyGlass,
  faBox,
  faWrench,
  faDrumstickBite,
  faMugHot,
  faGlassWater,
  faUtensils,
  faFile,
  faBagShopping,
  faChevronLeft,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons';
import styles from '../modules/Lixeiras.module.css';
import LixeiraVermelha from '../../assets/lixeiraVermelha.png';
import LixeiraAzul from '../../assets/lixeiraAzul.png';
import LixeiraAmarela from '../../assets/lixeiraAmarela.png';
import LixeiraVerde from '../../assets/lixeiraVerde.png';
import LixeiraMarrom from '../../assets/lixeiraMarrom.png';

interface BinItem {
  icon: React.ReactNode;
  name: string;
}

interface Bin {
  id: string;
  label: string;
  color: string;
  textColor: string;
  imgSrc: string;
  items: BinItem[];
}

const BINS: Bin[] = [
  {
    id: 'plastico',
    label: 'Plástico',
    color: '#c0392b',
    textColor: '#fff',
    imgSrc: LixeiraVermelha,
    items: [
      { icon: <FontAwesomeIcon icon={faBottleWater} />, name: 'Garrafa PET' },
      {
        icon: <FontAwesomeIcon icon={faBagShopping} />,
        name: 'Sacola Plástica',
      },
    ],
  },
  {
    id: 'papel',
    label: 'Papel',
    color: '#1a3a6b',
    textColor: '#fff',
    imgSrc: LixeiraAzul,
    items: [
      { icon: <FontAwesomeIcon icon={faNewspaper} />, name: 'Jornal' },
      { icon: <FontAwesomeIcon icon={faBox} />, name: 'Papelão' },
      { icon: <FontAwesomeIcon icon={faFile} />, name: 'Folha de Papel' },
    ],
  },
  {
    id: 'metal',
    label: 'Metal',
    color: '#d4a017',
    textColor: '#1a1a1a',
    imgSrc: LixeiraAmarela,
    items: [
      { icon: <FontAwesomeIcon icon={faWhiskeyGlass} />, name: 'Lata' },
      { icon: <FontAwesomeIcon icon={faWrench} />, name: 'Ferramenta' },
      { icon: <FontAwesomeIcon icon={faUtensils} />, name: 'Alumínio' },
    ],
  },
  {
    id: 'vidro',
    label: 'Vidro',
    color: '#1e7a3e',
    textColor: '#fff',
    imgSrc: LixeiraVerde,
    items: [
      { icon: <FontAwesomeIcon icon={faWineBottle} />, name: 'Garrafa' },
      { icon: <FontAwesomeIcon icon={faBox} />, name: 'Pote' },
      { icon: <FontAwesomeIcon icon={faGlassWater} />, name: 'Copo' },
    ],
  },
  {
    id: 'organico',
    label: 'Orgânico',
    color: '#5c3317',
    textColor: '#fff',
    imgSrc: LixeiraMarrom,
    items: [
      { icon: <FontAwesomeIcon icon={faLeaf} />, name: 'Folhas' },
      { icon: <FontAwesomeIcon icon={faDrumstickBite} />, name: 'Restos' },
      { icon: <FontAwesomeIcon icon={faMugHot} />, name: 'Borra café' },
    ],
  },
];

// ─── Card desktop ────────────────────────────────────────────
function BinCard({ bin }: { bin: Bin }) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function handleEnter() {
    setActive(true);
    setIndex(0);
    timerRef.current = setInterval(() => {
      setIndex(prev => (prev + 1) % bin.items.length);
    }, 1200);
  }

  function handleLeave() {
    setActive(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setIndex(0);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const currentItem = bin.items[index];

  return (
    <div
      className={styles.binCard}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div className={styles.imgWrapper}>
        <img
          src={bin.imgSrc}
          alt={bin.label}
          className={`${styles.binImg} ${active ? styles.binImgHover : ''}`}
        />
      </div>
      <div className={styles.barWrapper}>
        <div className={styles.barLine} style={{ background: bin.color }} />
        <div
          className={`${styles.barPanel} ${active ? styles.barPanelOpen : ''}`}
          style={{ background: bin.color }}
        >
          <div className={styles.panelInner}>
            <span
              className={styles.panelTitle}
              style={{ color: bin.textColor }}
            >
              {bin.label}
            </span>
            <div className={styles.itemSingle} key={index}>
              <div
                className={styles.itemIconBox}
                style={{ color: bin.textColor }}
              >
                {currentItem.icon}
              </div>
              <span
                className={styles.itemName}
                style={{ color: bin.textColor }}
              >
                {currentItem.name}
              </span>
            </div>
            <div className={styles.dots}>
              {bin.items.map((_, i) => (
                <button
                  key={i}
                  className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
                  style={
                    i === index
                      ? { background: bin.textColor }
                      : { background: `${bin.textColor}66` }
                  }
                  aria-label={`Item ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Carrossel mobile ────────────────────────────────────────
function MobileCarrossel() {
  const [current, setCurrent] = useState(0);
  const [animating, setAnimating] = useState(false);
  const touchStartX = useRef(0);

  function goTo(index: number) {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      setCurrent(index);
      setAnimating(false);
    }, 200);
  }

  function next() {
    goTo((current + 1) % BINS.length);
  }
  function prev() {
    goTo((current - 1 + BINS.length) % BINS.length);
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

  const bin = BINS[current];

  return (
    <div
      className={styles.mobileCarrossel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Badge colorido com nome da lixeira */}
      <div
        className={styles.mobileBadge}
        style={{ backgroundColor: bin.color, color: bin.textColor }}
      >
        {bin.label}
      </div>

      {/* Imagem da lixeira */}
      <img
        src={bin.imgSrc}
        alt={bin.label}
        className={`${styles.mobileImg} ${animating ? styles.mobileImgHide : ''}`}
      />

      {/* Setas + dots */}
      <div className='flex items-center gap-6'>
        <button onClick={prev} className='text-reuseai-cinza dark:text-[#a0a0a0] text-lg p-2'>
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>

        <div className={styles.mobileDots}>
          {BINS.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`${styles.mobileDot} ${i === current ? styles.mobileDotActive : ''}`}
              style={i === current ? { backgroundColor: bin.color } : {}}
              aria-label={`Lixeira ${i + 1}`}
            />
          ))}
        </div>

        <button onClick={next} className='text-reuseai-cinza dark:text-[#a0a0a0] text-lg p-2'>
          <FontAwesomeIcon icon={faChevronRight} />
        </button>
      </div>

      <p className={styles.swipeHint}>← deslize para navegar →</p>
    </div>
  );
}

// ─── Export principal ────────────────────────────────────────
export default function BinSection() {
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <p className={styles.sectionLabel}>Guia de lixeiras</p>
        <h2 className={styles.sectionTitle}>
          Cada cor tem um <span>propósito</span>
        </h2>
        <p className={styles.sectionSubtitle}>
          Passe o mouse para ver o que vai em cada lixeira. Ou use nossa IA para
          nunca mais errar.
        </p>
      </div>

      {/* Desktop */}
      <div className={styles.stage}>
        {BINS.map(bin => (
          <BinCard key={bin.id} bin={bin} />
        ))}
      </div>

      {/* Mobile */}
      <MobileCarrossel />
    </section>
  );
}
