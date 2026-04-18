import {
  GoogleLogin,
  GoogleOAuthProvider,
  type CredentialResponse,
} from '@react-oauth/google';
import { useTheme } from '../../contexts/ThemeContext';
import { showErrorAlert, showInfoAlert } from '../../utils/alerts';

interface GoogleAuthButtonProps {
  mode: 'login' | 'register';
  onAuthenticate: (credential: string) => Promise<void>;
}

function GoogleIcon() {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 48 48'
      className='h-5 w-5'
      aria-hidden='true'
    >
      <path
        fill='#FFC107'
        d='M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.218 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.851 1.154 7.966 3.034l5.657-5.657C34.046 6.053 29.277 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.651-.389-3.917z'
      />
      <path
        fill='#FF3D00'
        d='M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.851 1.154 7.966 3.034l5.657-5.657C34.046 6.053 29.277 4 24 4c-7.682 0-14.41 4.337-17.694 10.691z'
      />
      <path
        fill='#4CAF50'
        d='M24 44c5.176 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.147 35.091 26.676 36 24 36c-5.197 0-9.625-3.317-11.283-7.946l-6.522 5.025C9.439 39.556 16.201 44 24 44z'
      />
      <path
        fill='#1976D2'
        d='M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.084 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.651-.389-3.917z'
      />
    </svg>
  );
}

function GoogleAuthControl({ mode, onAuthenticate }: GoogleAuthButtonProps) {
  const { theme } = useTheme();

  async function handleSuccess(response: CredentialResponse) {
    if (!response.credential) {
      await showErrorAlert(
        'Google indisponível',
        'O Google não retornou uma credencial válida. Tente novamente.',
      );
      return;
    }

    await onAuthenticate(response.credential);
  }

  return (
    <div className='google-auth-button flex w-full justify-center'>
      <GoogleLogin
        onSuccess={response => {
          void handleSuccess(response);
        }}
        onError={() => {
          void showErrorAlert(
            'Falha no login com Google',
            'Não foi possível concluir a autenticação com Google agora.',
          );
        }}
        text={mode === 'register' ? 'signup_with' : 'signin_with'}
        theme={theme === 'dark' ? 'filled_black' : 'outline'}
        shape='pill'
        size='large'
        width='280'
        logo_alignment='left'
        ux_mode='popup'
      />
    </div>
  );
}

export function GoogleAuthButton({
  mode,
  onAuthenticate,
}: GoogleAuthButtonProps) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';
  const isConfigured = Boolean(clientId);

  return (
    <div className='mt-6'>
      <div className='flex items-center gap-3'>
        <span className='h-px flex-1 bg-reuseai-verde/10 dark:bg-reuseai-verdeNeon/15' />
        <span className='text-xs font-semibold uppercase tracking-[0.24em] text-reuseai-cinza/70 dark:text-white/45'>
          ou continue com
        </span>
        <span className='h-px flex-1 bg-reuseai-verde/10 dark:bg-reuseai-verdeNeon/15' />
      </div>

      <div className='mt-4 rounded-[24px] border border-reuseai-verde/10 bg-reuseai-verde/5 px-3 py-4 dark:border-reuseai-verdeNeon/10 dark:bg-[#0e1712] sm:px-4'>
        {isConfigured ? (
          <>
            <style>{`
              .google-auth-button iframe {
                width: min(100%, 280px) !important;
              }

              .google-auth-button > div {
                width: min(100%, 280px) !important;
              }

              @media (min-width: 640px) {
                .google-auth-button iframe,
                .google-auth-button > div {
                  width: min(100%, 320px) !important;
                }
              }
            `}</style>
            <GoogleOAuthProvider clientId={clientId}>
              <GoogleAuthControl mode={mode} onAuthenticate={onAuthenticate} />
            </GoogleOAuthProvider>
          </>
        ) : (
          <button
            type='button'
            onClick={() =>
              showInfoAlert(
                'Configuração pendente',
                'Preencha GOOGLE_OAUTH_CLIENT_ID no .env para liberar o login com Google.',
              )
            }
            className='inline-flex min-h-[44px] w-full max-w-[280px] items-center justify-center gap-3 rounded-full border border-reuseai-verde/20 bg-white px-5 py-3 text-sm font-semibold text-reuseai-preto transition-colors hover:bg-reuseai-verde/5 dark:border-reuseai-verdeNeon/15 dark:bg-[#111a14] dark:text-reuseai-branco dark:hover:bg-[#17231b] sm:max-w-[320px]'
          >
            <GoogleIcon />
            Google
          </button>
        )}
      </div>
    </div>
  );
}
