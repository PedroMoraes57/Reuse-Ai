import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCamera,
  faTrashCan,
  faUserPlus,
  faArrowLeft,
  faArrowRight,
} from '@fortawesome/free-solid-svg-icons';
import { AuthShell } from '../components/Auth/AuthShell';
import { GoogleAuthButton } from '../components/Auth/GoogleAuthButton';
import { PasswordField } from '../components/Auth/PasswordField';
import { googleAuthenticate, register } from '../services/AuthApi';
import { setAuthToken } from '../services/api';
import defaultAvatar from '../assets/default-avatar.svg';
import { showErrorAlert, showSuccessAlert } from '../utils/alerts';
import { getPasswordStrength } from '../utils/passwordStrength';

function getPasswordBarClass(index: number, score: number) {
  if (score <= index) {
    return 'bg-reuseai-verde/10 dark:bg-white/10';
  }

  if (score === 1) {
    return 'bg-red-400';
  }

  if (score === 2) {
    return 'bg-amber-400';
  }

  if (score === 3) {
    return 'bg-lime-500';
  }

  return 'bg-reuseai-verde';
}

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [searchParams] = useSearchParams();
  const passwordStrength = getPasswordStrength(password);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  function handleAvatarChange(file: File | null) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    setAvatar(file);

    if (!file) {
      setAvatarPreview(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextPreviewUrl;
    setAvatarPreview(nextPreviewUrl);
  }

  async function handleContinue() {
    if (!firstName.trim()) {
      await showErrorAlert(
        'Nome obrigatório',
        'Preencha seu nome antes de continuar.',
      );
      return;
    }

    if (!lastName.trim()) {
      await showErrorAlert(
        'Sobrenome obrigatório',
        'Preencha seu sobrenome antes de continuar.',
      );
      return;
    }

    if (!username.trim()) {
      await showErrorAlert(
        'Nome de usuário obrigatório',
        'Escolha um nome de usuário antes de continuar.',
      );
      return;
    }

    if (!email.trim()) {
      await showErrorAlert(
        'E-mail obrigatório',
        'Informe seu e-mail antes de continuar.',
      );
      return;
    }

    setStep(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSuccessMessage(null);

    try {
      const data = await register({
        username,
        email,
        first_name: firstName,
        last_name: lastName,
        password,
        password_confirmation: passwordConfirmation,
        avatar,
      });

      setSuccessMessage(data.detail);
      setPassword('');
      setPasswordConfirmation('');

      await showSuccessAlert(
        'Conta criada com sucesso',
        'Enviamos o link de ativação para o e-mail informado. Confirme sua conta para entrar.',
      );
    } catch (err) {
      await showErrorAlert(
        'Não foi possível concluir o cadastro',
        err instanceof Error ? err.message : 'Erro ao registrar',
      );
    } finally {
      setLoading(false);
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
      layout='register'
      badge={step === 1 ? 'Crie sua conta' : 'Finalize seu cadastro'}
      title={
        step === 1
          ? 'Abra sua conta na Reuse.AI e comece do jeito certo.'
          : 'Falta pouco para ativar seu acesso.'
      }
      description={
        step === 1
          ? 'Preencha seus dados para continuar o cadastro.'
          : 'Escolha uma senha segura, adicione uma foto se quiser e conclua sua conta.'
      }
      highlights={[
        {
          title: step === 1 ? 'Dados iniciais' : 'Segurança reforçada',
          description:
            step === 1
              ? 'Primeiro coletamos suas informações principais para deixar o processo mais leve.'
              : 'Sua senha é validada e confirmada antes de finalizar o cadastro.',
        },
        {
          title: step === 1 ? 'Fluxo mais rápido' : 'Avatar opcional',
          description:
            step === 1
              ? 'Nada de um paredão de campos de uma vez só. Você avança em etapas.'
              : 'Você pode enviar uma foto agora ou seguir com o avatar padrão da plataforma.',
        },
        {
          title: step === 1 ? 'Confirmação por e-mail' : 'Ativação no seu e-mail',
          description:
            step === 1
              ? 'Depois de concluir o cadastro, sua conta será ativada pelo link enviado no e-mail.'
              : 'Assim que terminar, enviamos a confirmação para liberar o seu acesso.',
        },
      ]}
      footer={
        <p className='text-center text-sm text-reuseai-cinza dark:text-white/70'>
          Já possui conta?{' '}
          <Link
            to='/login'
            className='font-semibold text-reuseai-verde hover:text-reuseai-azul dark:text-reuseai-verdeNeon dark:hover:text-reuseai-azulClaro'
          >
            Entrar agora
          </Link>
        </p>
      }
    >
      {successMessage && (
        <div className='rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100'>
          <p className='font-semibold'>{successMessage}</p>
          <p className='mt-1'>
            Confira sua caixa de entrada, spam ou promoções e clique no botão de
            ativação enviado para <span className='font-semibold'>{email}</span>
            .
          </p>
          <p className='mt-2 text-emerald-900/80 dark:text-emerald-100/80'>
            Depois da confirmação, você já poderá entrar normalmente.
          </p>
        </div>
      )}

      {!successMessage && step === 1 && (
        <div className='w-full'>
          <div>
            <span className='inline-flex rounded-full bg-reuseai-verde/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-reuseai-verde dark:bg-reuseai-verdeNeon/10 dark:text-reuseai-verdeNeon'>
              Etapa 1 de 2
            </span>
            <h2 className='mt-5 text-xl font-black text-reuseai-preto dark:text-reuseai-branco sm:text-[2rem]'>
              Vamos começar pelos dados básicos
            </h2>
            <p className='mt-3 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
              Informe suas informações principais para seguir para a próxima
              etapa.
            </p>
          </div>

          <form
            onSubmit={async event => {
              event.preventDefault();
              await handleContinue();
            }}
            className='mt-10 space-y-4'
          >
            <div className='grid gap-4 md:grid-cols-2'>
              <label className='block'>
                <span className='mb-2 block text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                  Nome
                </span>
                <input
                  value={firstName}
                  onChange={event => setFirstName(event.target.value)}
                  placeholder='Seu nome'
                  autoComplete='given-name'
                  className='block w-full rounded-2xl border border-reuseai-verde/15 bg-reuseai-branco px-4 py-2 text-sm text-reuseai-preto shadow-[0_12px_30px_-24px_rgba(28,28,37,0.3)] outline-none transition-all placeholder:text-reuseai-cinza/45 focus:border-reuseai-verde focus:ring-4 focus:ring-reuseai-verde/10 dark:border-reuseai-verdeNeon/10 dark:bg-[#111a14] dark:text-reuseai-branco dark:placeholder:text-white/35 dark:focus:border-reuseai-verdeNeon dark:focus:ring-reuseai-verdeNeon/10'
                />
              </label>

              <label className='block'>
                <span className='mb-2 block text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                  Sobrenome
                </span>
                <input
                  value={lastName}
                  onChange={event => setLastName(event.target.value)}
                  placeholder='Seu sobrenome'
                  autoComplete='family-name'
                  className='block w-full rounded-2xl border border-reuseai-verde/15 bg-reuseai-branco px-4 py-2 text-sm text-reuseai-preto shadow-[0_12px_30px_-24px_rgba(28,28,37,0.3)] outline-none transition-all placeholder:text-reuseai-cinza/45 focus:border-reuseai-verde focus:ring-4 focus:ring-reuseai-verde/10 dark:border-reuseai-verdeNeon/10 dark:bg-[#111a14] dark:text-reuseai-branco dark:placeholder:text-white/35 dark:focus:border-reuseai-verdeNeon dark:focus:ring-reuseai-verdeNeon/10'
                />
              </label>
            </div>

            <label className='block'>
              <span className='mb-2 block text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                Nome de usuário
              </span>
              <input
                value={username}
                onChange={event => setUsername(event.target.value)}
                placeholder='Escolha um nome de usuário'
                autoComplete='username'
                className='block w-full rounded-2xl border border-reuseai-verde/15 bg-reuseai-branco px-4 py-2 text-sm text-reuseai-preto shadow-[0_12px_30px_-24px_rgba(28,28,37,0.3)] outline-none transition-all placeholder:text-reuseai-cinza/45 focus:border-reuseai-verde focus:ring-4 focus:ring-reuseai-verde/10 dark:border-reuseai-verdeNeon/10 dark:bg-[#111a14] dark:text-reuseai-branco dark:placeholder:text-white/35 dark:focus:border-reuseai-verdeNeon dark:focus:ring-reuseai-verdeNeon/10'
              />
            </label>

            <label className='block'>
              <span className='mb-2 block text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                E-mail
              </span>
              <input
                type='email'
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder='nome@exemplo.com'
                autoComplete='email'
                className='block w-full rounded-2xl border border-reuseai-verde/15 bg-reuseai-branco px-4 py-2 text-sm text-reuseai-preto shadow-[0_12px_30px_-24px_rgba(28,28,37,0.3)] outline-none transition-all placeholder:text-reuseai-cinza/45 focus:border-reuseai-verde focus:ring-4 focus:ring-reuseai-verde/10 dark:border-reuseai-verdeNeon/10 dark:bg-[#111a14] dark:text-reuseai-branco dark:placeholder:text-white/35 dark:focus:border-reuseai-verdeNeon dark:focus:ring-reuseai-verdeNeon/10'
              />
            </label>

            <button
              type='submit'
              className='flex w-full items-center justify-center gap-2 rounded-2xl bg-reuseai-verde px-5 py-3 text-sm font-bold text-reuseai-branco transition-all hover:-translate-y-0.5 hover:bg-reuseai-azul'
            >
              Continuar
              <FontAwesomeIcon icon={faArrowRight} />
            </button>
          </form>

          <div className='mt-5'>
            <GoogleAuthButton
              mode='register'
              onAuthenticate={handleGoogleAuthentication}
            />
          </div>
        </div>
      )}

      {!successMessage && step === 2 && (
        <div className='w-full'>
          <div>
            <span className='inline-flex rounded-full bg-reuseai-verde/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-reuseai-verde dark:bg-reuseai-verdeNeon/10 dark:text-reuseai-verdeNeon'>
              Etapa 2 de 2
            </span>
            <h2 className='mt-5 text-xl font-black text-reuseai-preto dark:text-reuseai-branco sm:text-[2rem]'>
              Agora finalize sua conta
            </h2>
            <p className='mt-3 text-sm leading-6 text-reuseai-cinza dark:text-white/70'>
              Defina sua senha, escolha uma foto se quiser e conclua o cadastro.
            </p>
          </div>

          <form onSubmit={handleSubmit} className='mt-6 space-y-4'>
            <div className='rounded-[24px] border border-reuseai-verde/10 bg-reuseai-verde/5 p-4 dark:border-reuseai-verdeNeon/10 dark:bg-[#0f1813]'>
              <div className='flex items-center gap-3'>
                <img
                  src={avatarPreview || defaultAvatar}
                  alt='Avatar'
                  className='h-12 w-12 rounded-full border border-reuseai-verde/15 object-cover'
                />
                <div className='flex-1'>
                  <p className='text-sm font-semibold text-reuseai-preto dark:text-reuseai-branco'>
                    Foto de perfil opcional
                  </p>
                  <p className='mt-1 text-xs leading-5 text-reuseai-cinza dark:text-white/65'>
                    Você pode deixar sem foto. A Reuse.AI aplica um avatar
                    padrão automaticamente.
                  </p>
                  <div className='mt-3 flex flex-wrap gap-2'>
                    <label className='inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-full bg-reuseai-verde px-4 py-2 text-sm font-semibold text-reuseai-branco transition-colors hover:bg-reuseai-azul'>
                      <FontAwesomeIcon icon={faCamera} />
                      Escolher foto
                      <input
                        type='file'
                        accept='image/*'
                        className='hidden'
                        onChange={event =>
                          handleAvatarChange(event.target.files?.[0] ?? null)
                        }
                      />
                    </label>

                    {avatar && (
                      <button
                        type='button'
                        onClick={() => handleAvatarChange(null)}
                        className='inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/15'
                      >
                        <FontAwesomeIcon icon={faTrashCan} />
                        Remover foto
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className='grid gap-4 md:grid-cols-2'>
              <div>
                <PasswordField
                  label='Senha'
                  name='password'
                  value={password}
                  placeholder='Crie uma senha forte'
                  autoComplete='new-password'
                  onChange={setPassword}
                />
                <div className='mt-3'>
                  <div className='flex gap-2'>
                    {Array.from({ length: 4 }).map((_, index) => (
                      <span
                        key={index}
                        className={`h-2 flex-1 rounded-full transition-colors ${getPasswordBarClass(
                          index,
                          passwordStrength.score,
                        )}`}
                      />
                    ))}
                  </div>
                  <p className='mt-2 text-xs font-medium text-reuseai-cinza dark:text-white/65'>
                    {passwordStrength.label}
                  </p>
                </div>
              </div>

              <PasswordField
                label='Confirmar senha'
                name='password-confirmation'
                value={passwordConfirmation}
                placeholder='Repita a senha'
                autoComplete='new-password'
                onChange={setPasswordConfirmation}
              />
            </div>

            <div className='flex flex-col gap-3 sm:flex-row'>
              <button
                type='button'
                onClick={() => setStep(1)}
                className='flex w-full items-center justify-center gap-2 rounded-2xl border border-reuseai-verde/20 bg-white px-5 py-3 text-sm font-bold text-reuseai-preto transition-all hover:-translate-y-0.5 hover:border-reuseai-verde hover:text-reuseai-verde dark:border-white/10 dark:bg-[#111a14] dark:text-reuseai-branco dark:hover:border-reuseai-verdeNeon dark:hover:text-reuseai-verdeNeon'
              >
                <FontAwesomeIcon icon={faArrowLeft} />
                Voltar
              </button>

              <button
                type='submit'
                disabled={loading}
                className='flex w-full items-center justify-center gap-2 rounded-2xl bg-reuseai-verde px-5 py-3 text-sm font-bold text-reuseai-branco transition-all hover:-translate-y-0.5 hover:bg-reuseai-azul disabled:cursor-not-allowed disabled:opacity-60'
              >
                <FontAwesomeIcon icon={faUserPlus} />
                {loading ? 'Criando conta...' : 'Criar conta'}
              </button>
            </div>
          </form>
        </div>
      )}
    </AuthShell>
  );
}
