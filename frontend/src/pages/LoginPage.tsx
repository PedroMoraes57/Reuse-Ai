import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLeaf, faRightToBracket } from '@fortawesome/free-solid-svg-icons';
import { AuthShell } from '../components/Auth/AuthShell';
import { GoogleAuthButton } from '../components/Auth/GoogleAuthButton';
import { PasswordField } from '../components/Auth/PasswordField';
import {
  googleAuthenticate,
  login,
  resendVerificationEmail,
  type LoginError,
} from '../services/AuthApi';
import { setAuthToken } from '../services/api';
import {
  showErrorAlert,
  showInfoAlert,
  showSuccessAlert,
} from '../utils/alerts';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendEmail, setResendEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const verified = searchParams.get('verified');
    const email = searchParams.get('email');

    if (verified === '1') {
      void showSuccessAlert(
        'E-mail confirmado',
        'Seu e-mail foi confirmado com sucesso. Agora você já pode entrar.',
      );
    } else if (email) {
      setIdentifier(email);
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(identifier, password);
      setAuthToken(data.token);
      const nextPath = searchParams.get('next') || '/classificar';
      window.location.href = nextPath;
    } catch (err) {
      const authError = err as LoginError;
      if (authError.code === 'email_not_verified' && authError.email) {
        setResendEmail(authError.email);
        await showInfoAlert(
          'Confirmação pendente',
          authError.message ||
            'Seu e-mail ainda não foi confirmado. Reenvie a verificação e tente novamente.',
        );
      } else {
        await showErrorAlert(
          'Não foi possível entrar',
          authError.message || 'Não foi possível entrar agora.',
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    if (!resendEmail) return;
    setResending(true);
    try {
      const response = await resendVerificationEmail(resendEmail);
      await showSuccessAlert('E-mail reenviado', response.detail);
    } catch (err) {
      await showErrorAlert(
        'Falha ao reenviar',
        err instanceof Error
          ? err.message
          : 'Não foi possível reenviar o e-mail de verificação.',
      );
    } finally {
      setResending(false);
    }
  }

  async function handleGoogleAuthentication(credential: string) {
    try {
      const data = await googleAuthenticate(credential);
      setAuthToken(data.token);
      const nextPath = searchParams.get('next') || '/classificar';
      window.location.href = nextPath;
    } catch (err) {
      await showErrorAlert(
        'Google indisponível',
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir a autenticação com Google.',
      );
    }
  }

  return (
    <AuthShell
      layout='login'
      badge='Acesse sua conta'
      title='Entre para continuar usando a Reuse.AI sem perder seu fluxo.'
      description='Faça login para analisar imagens, acessar seu perfil e usar a plataforma com mais segurança.'
      highlights={[
        {
          title: 'Acesso protegido',
          description:
            'Suas análises e dados da conta ficam disponíveis apenas para você.',
        },
        {
          title: 'Confirmação por e-mail',
          description:
            'A conta é ativada por e-mail para evitar cadastros incompletos.',
        },
        {
          title: 'Entrada rápida',
          description:
            'Depois de entrar, você volta direto para a área que queria usar.',
        },
      ]}
      footer={
        <p className='text-center text-sm text-reuseai-cinza dark:text-white/70'>
          Ainda não tem conta?{' '}
          <Link
            to='/cadastro'
            className='font-semibold text-reuseai-verde hover:text-reuseai-azul dark:text-reuseai-verdeNeon dark:hover:text-reuseai-azulClaro'
          >
            Criar conta
          </Link>
        </p>
      }
    >
      <div>
        <span className='inline-flex rounded-full bg-reuseai-verde/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-reuseai-verde dark:bg-reuseai-verdeNeon/10 dark:text-reuseai-verdeNeon'>
          Login
        </span>
        <h2 className='mt-5 text-xl font-black text-reuseai-preto dark:text-reuseai-branco sm:text-[2rem]'>
          Que bom ver você de novo
        </h2>
        <p className='mt-3 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
          Use seu usuário ou e-mail e entre com sua senha para continuar.
        </p>
      </div>

      <form onSubmit={handleSubmit} className='mt-6 space-y-5'>
        <label className='block'>
          <span className='mb-2 block text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
            Usuário ou e-mail
          </span>
          <input
            value={identifier}
            onChange={event => setIdentifier(event.target.value)}
            placeholder='Digite seu usuário ou e-mail'
            autoComplete='username'
            className='block w-full rounded-2xl border border-reuseai-verde/15 bg-reuseai-branco px-4 py-2.5 text-sm text-reuseai-preto shadow-[0_12px_30px_-24px_rgba(28,28,37,0.3)] outline-none transition-all placeholder:text-reuseai-cinza/45 focus:border-reuseai-verde focus:ring-4 focus:ring-reuseai-verde/10 dark:border-reuseai-verdeNeon/10 dark:bg-[#111a14] dark:text-reuseai-branco dark:placeholder:text-white/35 dark:focus:border-reuseai-verdeNeon dark:focus:ring-reuseai-verdeNeon/10'
          />
        </label>

        <div>
          <PasswordField
            label='Senha'
            name='password'
            value={password}
            placeholder='Digite sua senha'
            autoComplete='current-password'
            onChange={setPassword}
          />
          <div className='mt-2 text-right'>
            <Link
              to='/esqueci-senha'
              className='text-xs font-semibold text-reuseai-verde hover:text-reuseai-azul dark:text-reuseai-verdeNeon dark:hover:text-reuseai-azulClaro'
            >
              Esqueceu a senha?
            </Link>
          </div>
        </div>

        <button
          type='submit'
          disabled={loading}
          className='flex w-full items-center justify-center gap-2 rounded-2xl bg-reuseai-verde px-5 py-3 text-sm font-bold text-reuseai-branco transition-all hover:-translate-y-0.5 hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
        >
          <FontAwesomeIcon icon={faRightToBracket} />
          {loading ? 'Entrando...' : 'Entrar agora'}
        </button>
      </form>

      <GoogleAuthButton
        mode='login'
        onAuthenticate={handleGoogleAuthentication}
      />

      {resendEmail && (
        <div className='mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm leading-6 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100'>
          <p className='font-semibold'>
            Seu cadastro ainda precisa da confirmação por e-mail.
          </p>
          <p className='mt-1'>
            Se você não encontrou a mensagem, podemos reenviar o link para{' '}
            <span className='font-semibold'>{resendEmail}</span>.
          </p>
          <button
            type='button'
            onClick={handleResendVerification}
            disabled={resending}
            className='mt-3 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-4 py-2 font-semibold text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-400/20 dark:bg-[#1a1710] dark:text-amber-100 dark:hover:bg-[#241d12]'
          >
            <FontAwesomeIcon icon={faLeaf} />
            {resending ? 'Reenviando...' : 'Reenviar verificação'}
          </button>
        </div>
      )}
    </AuthShell>
  );
}
