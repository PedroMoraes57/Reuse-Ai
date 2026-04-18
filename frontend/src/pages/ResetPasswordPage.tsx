import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock } from '@fortawesome/free-solid-svg-icons';
import { AuthShell } from '../components/Auth/AuthShell';
import { PasswordField } from '../components/Auth/PasswordField';
import { confirmPasswordReset } from '../services/AuthApi';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid') ?? '';
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !token) {
      setError('Link de recuperação inválido ou incompleto. Solicite um novo pelo login.');
    }
  }, [uid, token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== passwordConfirmation) {
      setError('As senhas informadas não coincidem.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await confirmPasswordReset(uid, token, password, passwordConfirmation);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível redefinir a senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      layout='login'
      badge='Nova senha'
      title='Crie uma nova senha e recupere seu acesso à Reuse.AI.'
      description='Escolha uma senha forte para proteger sua conta. Após salvar, todas as sessões anteriores serão encerradas.'
      highlights={[
        {
          title: 'Sessões encerradas',
          description: 'Por segurança, todos os acessos anteriores são invalidados ao redefinir.',
        },
        {
          title: 'Link de uso único',
          description: 'Este link expira após o uso ou em 24 horas, o que ocorrer primeiro.',
        },
        {
          title: 'Conta protegida',
          description: 'Seu histórico e pontuação não são afetados pela redefinição de senha.',
        },
      ]}
      footer={
        <p className='text-center text-sm text-reuseai-cinza dark:text-white/70'>
          Já tem acesso?{' '}
          <Link
            to='/login'
            className='font-semibold text-reuseai-verde hover:text-reuseai-azul dark:text-reuseai-verdeNeon dark:hover:text-reuseai-azulClaro'
          >
            Entrar agora
          </Link>
        </p>
      }
    >
      <div>
        <span className='inline-flex rounded-full bg-reuseai-verde/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-reuseai-verde dark:bg-reuseai-verdeNeon/10 dark:text-reuseai-verdeNeon'>
          Redefinir senha
        </span>
        <h2 className='mt-5 text-xl font-black text-reuseai-preto dark:text-reuseai-branco sm:text-[2rem]'>
          Criar nova senha
        </h2>
        <p className='mt-3 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
          Escolha uma senha segura. Ela deve ter pelo menos 8 caracteres.
        </p>
      </div>

      {done ? (
        <div className='mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 dark:border-emerald-500/20 dark:bg-emerald-500/10'>
          <p className='font-semibold text-emerald-800 dark:text-emerald-100'>
            Senha atualizada com sucesso!
          </p>
          <p className='mt-2 text-sm leading-6 text-emerald-700 dark:text-emerald-200'>
            Sua nova senha está ativa. Você já pode entrar na plataforma normalmente.
          </p>
          <Link
            to='/login'
            className='mt-4 inline-flex items-center gap-2 rounded-full bg-reuseai-verde px-5 py-2.5 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul'
          >
            Ir para o login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className='mt-6 space-y-5'>
          <PasswordField
            label='Nova senha'
            name='password'
            value={password}
            placeholder='Mínimo de 8 caracteres'
            autoComplete='new-password'
            onChange={setPassword}
          />

          <PasswordField
            label='Confirmar nova senha'
            name='password_confirmation'
            value={passwordConfirmation}
            placeholder='Repita a nova senha'
            autoComplete='new-password'
            onChange={setPasswordConfirmation}
          />

          {error && (
            <p className='rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100'>
              {error}
            </p>
          )}

          <button
            type='submit'
            disabled={loading || !password || !passwordConfirmation || !uid || !token}
            className='flex w-full items-center justify-center gap-2 rounded-2xl bg-reuseai-verde px-5 py-3 text-sm font-bold text-reuseai-branco transition-all hover:-translate-y-0.5 hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
          >
            <FontAwesomeIcon icon={faLock} />
            {loading ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
