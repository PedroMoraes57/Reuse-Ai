import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart } from '@fortawesome/free-solid-svg-icons';
import styles from '../modules/Footer.module.css';
import logo from '../../assets/logo.png';

function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.grid}>
        {/* Logo + descrição */}
        <div className={styles.logoCol}>
          <img src={logo} alt='Reuse.AI' className={styles.logo} />
          <p className={styles.descricao}>
            Tecnologia de visão computacional para orientar o descarte
            sustentável. IA com propósito ambiental.
          </p>
        </div>

        {/* Produto */}
        <div>
          <p className={styles.colunaTitle}>Produto</p>
          <a href='#como-funciona' className={styles.link}>
            Como funciona
          </a>
          <a href='#planos' className={styles.link}>
            Planos
          </a>
          <a href='#api' className={styles.link}>
            API
          </a>
          <a href='#changelog' className={styles.link}>
            Changelog
          </a>
        </div>

        {/* Empresa */}
        <div>
          <p className={styles.colunaTitle}>Empresa</p>
          <a href='#sobre' className={styles.link}>
            Sobre Nós
          </a>
          <a href='#impacto' className={styles.link}>
            Impacto
          </a>
          <a href='#blog' className={styles.link}>
            Blog
          </a>
          <a href='#contato' className={styles.link}>
            Contato
          </a>
        </div>

        {/* Legal */}
        <div>
          <p className={styles.colunaTitle}>Legal</p>
          <a href='#privacidade' className={styles.link}>
            Privacidade
          </a>
          <a href='#termos' className={styles.link}>
            Termos de uso
          </a>
          <a href='#cookies' className={styles.link}>
            Cookies
          </a>
        </div>
      </div>

      {/* Divider */}
      <hr className={styles.divider} />

      {/* Bottom */}
      <div className={styles.bottom}>
        <p className={styles.copyright}>
          © 2026 Reuse.AI — Todos os direitos reservados.
        </p>
        <p className={styles.feito}>
          Feito com{' '}
          <FontAwesomeIcon icon={faHeart} className={styles.coracao} /> para um
          planeta melhor
        </p>
      </div>
    </footer>
  );
}
export default Footer;
