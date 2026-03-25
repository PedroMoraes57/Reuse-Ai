// src/components/classification/StepList.tsx

const steps = [
  {
    num: '01',
    icon: 'fas fa-camera-retro',
    title: 'Fotografe o item',
    description:
      'Tire ou selecione uma foto clara do resíduo que deseja descartar.',
  },
  {
    num: '02',
    icon: 'fas fa-brain',
    title: 'IA analisa',
    description:
      'Nossa IA identifica o material e classifica o tipo de resíduo automaticamente.',
  },
  {
    num: '03',
    icon: 'fas fa-map-marker-alt',
    title: 'Descarte correto',
    description:
      'Receba instruções claras de como e onde descartar o item na sua cidade.',
  },
];

export function StepList() {
  return (
    <div className='flex flex-wrap items-start justify-center gap-4'>
      {steps.map((step, index) => (
        <div key={step.num} className='flex items-start gap-4'>
          {/* Card do passo */}
          <div className='bg-white border border-gray-200 rounded-2xl p-8 max-w-[240px] flex-1 min-w-[180px] text-center shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200'>
            <p className='text-[0.72rem] font-extrabold tracking-widest text-green-600 uppercase mb-3'>
              {step.num}
            </p>
            <div className='w-14 h-14 bg-green-50 rounded-full flex items-center justify-center text-green-600 text-2xl mx-auto mb-4'>
              <i className={step.icon} />
            </div>
            <h3 className='text-sm font-bold text-gray-900 mb-2'>
              {step.title}
            </h3>
            <p className='text-sm text-gray-500 leading-relaxed'>
              {step.description}
            </p>
          </div>

          {/* Seta separadora (oculta no mobile) */}
          {index < steps.length - 1 && (
            <div className='hidden md:flex items-center pt-14 text-gray-300 text-xl'>
              <i className='fas fa-chevron-right' />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
