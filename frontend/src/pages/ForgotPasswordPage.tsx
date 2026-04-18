import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { AuthShell } from '../components/Auth/AuthShell';
import { requestPasswordReset } from '../services/AuthApi';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível enviar o e-mail de recuperação.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      layout='login'
      badge='Recuperar acesso'
      title='Redefina sua senha e volte a usar a Reuse.AI.'
      description='Informe o e-mail vinculado à sua conta e enviaremos um link para criar uma nova senha.'
      highlights={[
        {
          title: 'Link seguro',
          description: 'O link de recuperação expira em 24 horas e só pode ser usado uma vez.',
        },
        {
          title: 'Sem perda de dados',
          description: 'Apenas a senha é alterada. Seu histórico e pontuação permanecem intactos.',
        },
        {
          title: 'Proteção garantida',
          description: 'Após a redefinição, todas as sessões anteriores são encerradas.',
        },
      ]}
      footer={
        <p className='text-center text-sm text-reuseai-cinza dark:text-white/70'>
          Lembrou a senha?{' '}
          <Link
            to='/login'
            className='font-semibold text-reuseai-verde hover:text-reuseai-azul dark:text-reuseai-verdeNeon dark:hover:text-reuseai-azulClaro'
          >
            Voltar ao login
          </Link>
        </p>
      }
    >
      <div>
        <span className='inline-flex rounded-full bg-reuseai-verde/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-reuseai-verde dark:bg-reuseai-verdeNeon/10 dark:text-reuseai-verdeNeon'>
          Esqueci minha senha
        </span>
        <h2 className='mt-5 text-xl font-black text-reuseai-preto dark:text-reuseai-branco sm:text-[2rem]'>
          Recuperar acesso
        </h2>
        <p className='mt-3 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
          Digite o e-mail da sua conta e enviaremos as instruções para redefinir sua senha.
        </p>
      </div>

      {sent ? (
        <div className='mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 dark:border-emerald-500/20 dark:bg-emerald-500/10'>
          <p className='font-semibold text-emerald-800 dark:text-emerald-100'>
            E-mail enviado com sucesso!
          </p>
          <p className='mt-2 text-sm leading-6 text-emerald-700 dark:text-emerald-200'>
            Se existir uma conta ativa com o e-mail informado, você receberá o link de recuperação
            em breve. Verifique também a pasta de spam.
          </p>
          <Link
            to='/login'
            className='mt-4 inline-flex items-center gap-2 rounded-full bg-reuseai-verde px-5 py-2.5 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul'
          >
            Voltar ao login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className='mt-6 space-y-5'>
          <label className='block'>
            <span className='mb-2 block text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
              E-mail da conta
            </span>
            <div className='relative'>
              <FontAwesomeIcon
                icon={faEnvelope}
                className='pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-reuseai-cinza/50 dark:text-white/35'
              />
              <input
                type='email'
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder='seu@email.com'
                required
                autoComplete='email'
                className='block w-full rounded-2xl border border-reuseai-verde/15 bg-reuseai-branco py-2.5 pl-11 pr-4 text-sm text-reuseai-preto shadow-[0_12px_30px_-24px_rgba(28,28,37,0.3)] outline-none transition-all placeholder:text-reuseai-cinza/45 focus:border-reuseai-verde focus:ring-4 focus:ring-reuseai-verde/10 dark:border-reuseai-verdeNeon/10 dark:bg-[#111a14] dark:text-reuseai-branco dark:placeholder:text-white/35 dark:focus:border-reuseai-verdeNeon dark:focus:ring-reuseai-verdeNeon/10'
              />
            </div>
          </label>

          {error && (
            <p className='rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100'>
              {error}
            </p>
          )}

          <button
            type='submit'
            disabled={loading || !email.trim()}
            className='flex w-full items-center justify-center gap-2 rounded-2xl bg-reuseai-verde px-5 py-3 text-sm font-bold text-reuseai-branco transition-all hover:-translate-y-0.5 hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
          >
            <FontAwesomeIcon icon={faPaperPlane} />
            {loading ? 'Enviando...' : 'Enviar link de recuperação'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
