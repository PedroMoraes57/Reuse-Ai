import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSeedling,
  faRecycle,
  faBookOpen,
  faIndustry,
  faPeopleGroup,
  faMicroscope,
} from '@fortawesome/free-solid-svg-icons';
import styles from './modules/ImpactoReal.module.css';

const cards = [
  {
    icone: faSeedling,
    titulo: 'Economia circular',
    descricao:
      'Mais materiais chegam às usinas de reciclagem, fortalecendo a cadeia de economia circular no Brasil.',
  },
  {
    icone: faRecycle,
    titulo: 'Menos contaminação',
    descricao:
      'Reduzimos os erros na separação de resíduos, evitando a contaminação de lotes recicláveis inteiros.',
  },
  {
    icone: faBookOpen,
    titulo: 'Educação ambiental',
    descricao:
      'Cada uso da plataforma é um aprendizado. Com o tempo, o descarte correto vira hábito.',
  },
  {
    icone: faIndustry,
    titulo: 'Menos aterros',
    descricao:
      'Ao direcionar resíduos para reciclagem, contribuímos para reduzir a pressão sobre aterros sanitários.',
  },
  {
    icone: faPeopleGroup,
    titulo: 'Acesso democrático',
    descricao:
      'Interface simples, acessível a qualquer pessoa, independente de idade ou escolaridade.',
  },
  {
    icone: faMicroscope,
    titulo: 'IA em evolução',
    descricao:
      'Cada análise melhora nosso modelo. A plataforma fica mais precisa com o uso da comunidade.',
  },
];

function ImpactoReal() {
  return (
    <section className={styles.section} id='impacto'>
      <div className='max-w-6xl mx-auto'>
        {/* Cabeçalho */}
        <div className='text-center mb-16'>
          <span className='text-reuseai-verde font-semibold text-sm uppercase tracking-widest'>
            Impacto Real
          </span>
          <h2 className='text-4xl md:text-5xl font-black text-reuseai-preto mt-2 leading-tight'>
            Tecnologia com{' '}
            <span className='text-reuseai-verde'>propósito ambiental</span>
          </h2>
          <p className='text-reuseai-cinza mt-4 max-w-lg mx-auto text-sm'>
            Cada funcionalidade foi pensada para gerar impacto real no meio
            ambiente e transformar pequenas ações do dia a dia em mudanças
            concretas para o planeta.
          </p>
        </div>

        {/* Grid com linhas conectoras */}
        <div className={styles.grid}>
          {/* Linha horizontal segunda fileira — elemento real no DOM */}
          <div className={styles.linhaBottom} />

          {cards.map(card => (
            <div key={card.titulo} className={styles.card}>
              <div className={styles.icone}>
                <FontAwesomeIcon icon={card.icone} />
              </div>

              <h3 className='text-reuseai-branco font-bold text-lg'>
                {card.titulo}
              </h3>

              <p className='text-reuseai-branco/80 text-sm leading-relaxed text-justify'>
                {card.descricao}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ImpactoReal;
