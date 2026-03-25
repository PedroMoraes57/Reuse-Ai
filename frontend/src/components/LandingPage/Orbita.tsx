import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faEarth,
  faFile,
  faBatteryHalf,
  faWineGlass,
  faBottleWater,
} from '@fortawesome/free-solid-svg-icons';
import styles from '../modules/Orbita.module.css';

export default function Orbita() {
  return (
    <div className={styles.container}>
      {/* Círculos de órbita */}
      <div className={styles.orbit1}></div>
      <div className={styles.orbit2}></div>

      {/* Globo central — só o ícone sem fundo */}
      <div className={styles.globo}>
        <FontAwesomeIcon icon={faEarth} className=' text-reuseai-verde' />
      </div>

      {/* Ícone 1 — Papel */}
      <div className={styles.iconWrapper1}>
        <div className={styles.icon}>
          <FontAwesomeIcon icon={faFile} />
        </div>
      </div>

      {/* Ícone 2 — Bateria */}
      <div className={styles.iconWrapper2}>
        <div className={styles.icon}>
          <FontAwesomeIcon icon={faBatteryHalf} />
        </div>
      </div>

      {/* Ícone 3 — Vidro */}
      <div className={styles.iconWrapper3}>
        <div className={styles.icon}>
          <FontAwesomeIcon icon={faWineGlass} />
        </div>
      </div>

      {/* Ícone 4 — Garrafa */}
      <div className={styles.iconWrapper4}>
        <div className={styles.icon}>
          <FontAwesomeIcon icon={faBottleWater} />
        </div>
      </div>
    </div>
  );
}
