import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';

interface PasswordFieldProps {
  label: string;
  name: string;
  value: string;
  placeholder?: string;
  autoComplete?: string;
  onChange: (value: string) => void;
}

export function PasswordField({
  label,
  name,
  value,
  placeholder,
  autoComplete,
  onChange,
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <label className='block'>
      <span className='mb-2 block text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
        {label}
      </span>
      <div className='flex items-center rounded-2xl border border-reuseai-verde/15 bg-reuseai-branco px-4 py-2.5 shadow-[0_12px_30px_-24px_rgba(28,28,37,0.3)] focus-within:border-reuseai-verde focus-within:ring-4 focus-within:ring-reuseai-verde/10 dark:border-reuseai-verdeNeon/10 dark:bg-[#111a14] dark:focus-within:border-reuseai-verdeNeon dark:focus-within:ring-reuseai-verdeNeon/10'>
        <input
          id={name}
          name={name}
          type={isVisible ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={event => onChange(event.target.value)}
          className='w-full border-0 bg-transparent text-sm text-reuseai-preto outline-none placeholder:text-reuseai-cinza/45 dark:text-reuseai-branco dark:placeholder:text-white/35'
        />
        <button
          type='button'
          onClick={() => setIsVisible(currentValue => !currentValue)}
          className='ml-3 text-sm text-reuseai-cinza transition-colors hover:text-reuseai-verde dark:text-white/55 dark:hover:text-reuseai-verdeNeon'
          aria-label={isVisible ? 'Ocultar senha' : 'Mostrar senha'}
        >
          <FontAwesomeIcon icon={isVisible ? faEyeSlash : faEye} />
        </button>
      </div>
    </label>
  );
}
