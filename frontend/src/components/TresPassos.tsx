import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCamera,
  faRobot,
  faCircleCheck,
} from '@fortawesome/free-solid-svg-icons';
import styles from './modules/TresPassos.module.css';

const passos = [
  {
    numero: '01',
    icone: faCamera,
    titulo: 'Envie uma foto',
    descricao:
      'Tire uma foto do resíduo que deseja descartar com a câmera do seu celular ou computador.',
  },
  {
    numero: '02',
    icone: faRobot,
    titulo: 'IA identifica o material',
    descricao:
      'Nossa visão computacional analisa a imagem e identifica o tipo de material em segundos.',
  },
  {
    numero: '03',
    icone: faCircleCheck,
    titulo: 'Descarte com confiança',
    descricao:
      'Receba a cor da lixeira, o local de coleta e dicas para preparar o item corretamente.',
  },
];

function TresPassos() {
  return (
    <section className={styles.section}>
      <div className='max-w-5xl mx-auto'>
        {/* Cabeçalho */}
        <div className='text-center mb-12'>
          <span className='text-reuseai-verdeNeon font-semibold text-sm uppercase tracking-widest'>
            Como funciona
          </span>
          <h2 className='text-3xl md:text-4xl font-black text-reuseai-branco mt-2'>
            3 passos para descartar{' '}
            <span className='text-reuseai-verdeNeon'>certo</span>
          </h2>
          <p className='text-reuseai-branco/60 mt-3 max-w-lg mx-auto text-sm'>
            Simples, rápido e acessível. Sem precisar decorar regras ou
            consultar tabelas complicadas.
          </p>
        </div>

        {/* Cards com linha conectora */}
        <div className={styles.cardsWrapper}>
          {passos.map(passo => (
            <div key={passo.numero} className={styles.card}>
              {/* Número em círculo escuro */}
              <div className={styles.numero}>{passo.numero}</div>

              {/* Ícone */}
              <div className={styles.icone}>
                <FontAwesomeIcon icon={passo.icone} />
              </div>

              {/* Título */}
              <h3 className='text-reuseai-branco font-bold text-base'>
                {passo.titulo}
              </h3>

              {/* Descrição */}
              <p className='text-reuseai-branco/80 text-sm leading-relaxed text-justify'>
                {passo.descricao}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TresPassos;
