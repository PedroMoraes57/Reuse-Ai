import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCamera,
  faCircleCheck,
  faRobot,
} from '@fortawesome/free-solid-svg-icons';

const steps = [
  {
    num: '01',
    icon: faCamera,
    title: 'Fotografe o item',
    description:
      'Tire ou selecione uma imagem nítida do resíduo que deseja descartar.',
  },
  {
    num: '02',
    icon: faRobot,
    title: 'IA interpreta',
    description:
      'A classificação identifica o material e organiza o cenário mais provável.',
  },
  {
    num: '03',
    icon: faCircleCheck,
    title: 'Siga a orientação',
    description:
      'Veja o melhor canal de descarte e as recomendações para preparar o item.',
  },
];

export function StepList() {
  return (
    <div className='relative'>
      <div className='absolute left-[15%] right-[15%] top-7 hidden h-px bg-reuseai-verdeNeon/80 md:block' />

      <div className='grid gap-6 md:grid-cols-3'>
        {steps.map(step => (
          <div key={step.num} className='relative'>
            <article className='relative z-10 flex h-full flex-col items-center rounded-[28px] border border-white/10 bg-reuseai-azul p-8 text-center shadow-[0_35px_60px_-45px_rgba(0,0,0,0.85)] transition-transform duration-300 hover:-translate-y-1.5'>
              <div className='flex h-14 w-14 items-center justify-center rounded-full border border-reuseai-verdeNeon bg-black/20 text-sm font-black text-reuseai-branco'>
                {step.num}
              </div>

              <div className='mt-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-reuseai-branco/10 text-2xl text-reuseai-branco'>
                <FontAwesomeIcon icon={step.icon} />
              </div>

              <h3 className='mt-5 text-lg font-bold text-reuseai-branco'>
                {step.title}
              </h3>

              <p className='mt-3 text-sm leading-7 text-reuseai-branco/80'>
                {step.description}
              </p>
            </article>
          </div>
        ))}
      </div>
    </div>
  );
}
