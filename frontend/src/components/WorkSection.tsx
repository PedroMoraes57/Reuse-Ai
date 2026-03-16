import styles from './modules/WorkSection.module.css';
import lixeiras from '../assets/lixeirasWork.png';

function ComoFunciona() {
  return (
    <section className={styles.section} id='como-funciona'>
      <div className={styles.wrapper}>
        <div
          className={`${styles.container} border-t-[10px] border-reuseai-verdeNeon`}
        >
          <div>
            <h2 className='text-4xl md:text-5xl font-black  text-reuseai-branco leading-tight'>
              Como a <span className='text-reuseai-verdeNeon'>Reuse.AI</span>{' '}
              trabalha?
            </h2>

            <p className='text-reuseai-branco/70 mt-4 leading-relaxed text-base max-w-[500px] text-justify'>
              A Reuse.AI é um sistema baseado em inteligência artificial que
              analisa imagens enviadas pelos usuários para identificar materiais
              e orientar sobre o local e a forma correta de descarte. Com isso,
              a plataforma promove práticas sustentáveis, reduz erros na
              separação de resíduos e incentiva a responsabilidade ambiental.
            </p>

            {/* Lista com certinhos */}
            <ul className='mt-6 flex flex-col gap-3'>
              {[
                'Identifica objetos por foto em segundos',
                'Informa os materiais predominantes do item',
                'Indica o descarte correto para cada material',
                'Gamificação para incentivar boas práticas',
              ].map((item, index) => (
                <li key={index} className='flex items-start gap-3'>
                  <span className={styles.check}>✓</span>
                  <span className='text-reuseai-branco/80 text-sm'>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Imagem flutuando para fora do container */}
        <img
          src={lixeiras}
          alt='Lixeiras de reciclagem'
          className={styles.imagem}
        />
      </div>
    </section>
  );
}

export default ComoFunciona;
