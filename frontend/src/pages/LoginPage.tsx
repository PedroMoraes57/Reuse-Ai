import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/AuthApi';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await login(username, password);
      localStorage.setItem('authToken', data.token);
      // full reload so Navbar picks up authenticated state
      window.location.href = '/classificar';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='min-h-screen flex items-center justify-center bg-gray-50'>
      <div className='max-w-md w-full bg-white p-8 rounded-xl shadow'>
        <h2 className='text-2xl font-bold mb-4'>Entrar</h2>
        {error && <div className='mb-3 text-red-600'>{error}</div>}
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-gray-700'>Usuário</label>
            <input value={username} onChange={e => setUsername(e.target.value)} className='mt-1 block w-full border px-3 py-2 rounded' />
          </div>
          <div>
            <label className='block text-sm font-medium text-gray-700'>Senha</label>
            <input type='password' value={password} onChange={e => setPassword(e.target.value)} className='mt-1 block w-full border px-3 py-2 rounded' />
          </div>
          <div className='flex items-center justify-between'>
            <button type='submit' disabled={loading} className='bg-green-600 text-white px-4 py-2 rounded'>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
            <a href='/cadastro' className='text-sm text-gray-500'>Criar conta</a>
          </div>
        </form>
      </div>
    </div>
  );
}
