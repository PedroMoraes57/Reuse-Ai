import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { AuthShell } from '../components/Auth/AuthShell';
import { verifyEmail } from '../services/AuthApi';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const uid = searchParams.get('uid');
    const token = searchParams.get('token');

    if (!uid || !token) {
      setError('O link de verificação está incompleto ou inválido.');
      setIsLoading(false);
      return;
    }

    verifyEmail(uid, token)
      .then(response => setMessage(response.detail))
      .catch(err =>
        setError(
          err instanceof Error
            ? err.message
            : 'Não foi possível confirmar este e-mail.',
        ),
      )
      .finally(() => setIsLoading(false));
  }, [searchParams]);

  return (
    <AuthShell
      badge='Verificação'
      title='Estamos confirmando o seu e-mail para ativar a conta.'
      description='Essa etapa garante que o cadastro realmente pertence ao usuário antes de liberar login, perfil e análise autenticada.'
      highlights={[
        {
          title: 'Ativação da conta',
          description:
            'Depois da confirmação, o login passa a funcionar normalmente em toda a plataforma.',
        },
        {
          title: 'Mais consistência no fluxo',
          description:
            'A verificação evita contas incompletas e reduz erros de autenticação mais adiante.',
        },
        {
          title: 'Pronto para analisar',
          description:
            'Com o e-mail confirmado, a análise de imagens fica liberada dentro do fluxo principal.',
        },
      ]}
      footer={
        <p className='text-center text-sm text-reuseai-cinza dark:text-white/70'>
          Depois da confirmação, você pode{' '}
          <Link
            to='/login?verified=1'
            className='font-semibold text-reuseai-verde hover:text-reuseai-azul dark:text-reuseai-verdeNeon dark:hover:text-reuseai-azulClaro'
          >
            entrar na plataforma
          </Link>
          .
        </p>
      }
    >
      <div>
        <span className='inline-flex rounded-full bg-reuseai-verde/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-reuseai-verde dark:bg-reuseai-verdeNeon/10 dark:text-reuseai-verdeNeon'>
          Confirmação de e-mail
        </span>
        <h2 className='mt-5 text-2xl font-black text-reuseai-preto dark:text-reuseai-branco md:text-3xl'>
          Validando seu cadastro
        </h2>
      </div>

      {isLoading && (
        <div className='mt-8 flex flex-col items-center justify-center gap-4 rounded-[28px] border border-reuseai-verde/10 bg-reuseai-verde/5 px-6 py-12 text-center dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'>
          <div className='h-12 w-12 animate-spin rounded-full border-4 border-reuseai-verde/15 border-t-reuseai-verde' />
          <p className='text-sm font-semibold text-reuseai-cinza dark:text-white/70'>
            Processando o link de verificação...
          </p>
        </div>
      )}

      {!isLoading && message && (
        <div className='mt-8 rounded-[28px] border border-emerald-200 bg-emerald-50 px-5 py-5 text-sm leading-7 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100'>
          <p className='font-semibold'>{message}</p>
          <Link
            to='/login?verified=1'
            className='mt-4 inline-flex rounded-full bg-reuseai-verde px-5 py-2.5 font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul'
          >
            Ir para o login
          </Link>
        </div>
      )}

      {!isLoading && error && (
        <div className='mt-8 rounded-[28px] border border-red-200 bg-red-50 px-5 py-5 text-sm leading-7 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100'>
          <p className='flex items-center gap-2 font-semibold'>
            <FontAwesomeIcon icon={faTriangleExclamation} />
            {error}
          </p>
          <p className='mt-3 text-red-700/85'>
            Se o link expirou, volte ao login e solicite o reenvio do e-mail de
            verificação.
          </p>
        </div>
      )}
    </AuthShell>
  );
}
