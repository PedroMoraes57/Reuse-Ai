import { useState } from 'react';
import styles from './modules/CTA.module.css';

function CTA() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);

  function handleSubmit() {
    if (!email) return;
    setEnviado(true);
  }

  return (
    <section className={styles.section}>
      {/* Blur verde como elemento separado */}
      <div className={styles.blur} />

      <div className={styles.content}>
        {/* Título */}
        <h2 className='text-5xl md:text-7xl font-black text-reuseai-cinza leading-tight'>
          Faça parte da{' '}
          <span className='block text-reuseai-verde'>revolução do</span>
          <span className='block text-reuseai-verde'>descarte</span>
        </h2>

        {/* Subtítulo */}
        <p className='text-reuseai-cinza mt-6 text-base max-w-lg mx-auto leading-relaxed'>
          Receba novidades, acesso antecipado e dicas de sustentabilidade
          diretamente no seu e-mail.
        </p>

        {/* Input + Botão */}
        {!enviado ? (
          <div className='mt-10 flex flex-col sm:flex-row items-center justify-center gap-4'>
            <input
              type='email'
              placeholder='Seu@email.com'
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={styles.input}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
            <button className={styles.botao} onClick={handleSubmit}>
              Quero participar
            </button>
          </div>
        ) : (
          <div className='mt-10 text-reuseai-verde font-bold text-lg'>
            ✓ Ótimo! Te avisaremos em breve.
          </div>
        )}
      </div>
    </section>
  );
}

export default CTA;
