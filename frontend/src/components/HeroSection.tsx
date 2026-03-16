import styles from './modules/HeroSection.module.css';

export default function HeroSection() {
  return (
    <>
      {/* HERO COM IMAGEM DE FUNDO */}
      <section className={styles.hero}>
        <div className={styles.overlay}></div>

        <div
          className={`${styles.content} flex flex-col items-center justify-center min-h-screen text-center px-6`}
        >
          {/* Título */}
          <h1 className='text-4xl md:text-6xl font-black text-white max-w-3xl leading-tight'>
            Seu próximo descarte{' '}
            <span className='text-reuseai-verdeClaro'>inteligente.</span>
          </h1>

          {/* Subtítulo */}
          <p className='mt-4 text-white/80 text-lg max-w-xl font-light'>
            Tecnologia de visão computacional para promover o descarte
            sustentável.
          </p>

          {/* Botões */}
          <div className='mt-8 flex flex-col sm:flex-row gap-4'>
            <a
              href='/cadastro'
              className='bg-reuseai-azul hover:bg-reuseai-azulClaro text-reuseai-branco font-semibold px-5 py-3.5 rounded-md transition-colors'
            >
              Descarte Certo
            </a>

            <a href='#como-funciona' className={`${styles.btnSecundario}`}>
              Saiba Mais
            </a>
          </div>
        </div>
      </section>

      {/* FAIXA ESCURA */}
      <div className='bg-reuseai-cinza py-12 px-6 text-center'>
        <h2 className='text-reuseai-branco text-2xl md:text-3xl font-bold'>
          Já parou para pensar se está descartando{' '}
          <span className='text-reuseai-azulClaro'>corretamente?</span>
        </h2>
        <p className='text-reuseai-branco/80 mt-3 max-w-xl mx-auto font-light'>
          Com tecnologia de visão computacional, ajudamos você a tomar decisões
          sustentáveis em segundos.
        </p>
      </div>
    </>
  );
}
