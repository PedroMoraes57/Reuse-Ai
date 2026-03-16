import Orbita from './Orbita';

export default function ProblemSection() {
  const stats = [
    {
      valor: '70%',
      descricao:
        'dos resíduos recicláveis ainda são descartados incorretamente no Brasil',
    },
    {
      valor: 'R$14bi',
      descricao: 'em materiais recicláveis são desperdiçados por ano no país',
    },
    {
      valor: '80%',
      descricao:
        'da população não sabe diferenciar os tipos de lixo corretamente',
    },
    {
      valor: '1/3',
      descricao:
        'de todo o lixo gerado poderia ser reciclado mas vai para aterros',
    },
  ];

  return (
    <section className='bg-reuseai-branco py-20 px-6' id='o-problema'>
      <div className='max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-16'>
        {/* LADO ESQUERDO — Texto + Stats */}
        <div className='flex-1'>
          <span className='text-reuseai-verde font-semibold text-sm uppercase tracking-widest'>
            O Problema
          </span>

          <h2 className='text-4xl md:text-5xl font-black text-reuseai-cinza mt-2 leading-tight'>
            Descarte errado custa{' '}
            <span className='text-reuseai-verde'>mais do que você pensa.</span>
          </h2>

          <p className='text-reuseai-cinza mt-4 leading-relaxed text-md max-w-md'>
            A maioria das pessoas não para para pensar no custo real do descarte
            incorreto. Um único item no lugar errado pode contaminar toneladas
            de resíduos.
          </p>

          {/* GRID DE STATS */}
          <div className='mt-8 grid grid-cols-2 gap-4'>
            {stats.map((stat, index) => (
              <div key={index} className='bg-reuseai-verde p-5 rounded-xl'>
                <p className='text-reuseai-branco text-3xl font-black'>
                  {stat.valor}
                </p>
                <p className='text-reuseai-branco/80 text-xs mt-1 leading-relaxed'>
                  {stat.descricao}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* LADO DIREITO — Ilustração */}
        <div className='flex flex-1 justify-center'>
          <Orbita />
        </div>
      </div>
    </section>
  );
}
