import { useEffect, useState } from 'react';
import { me, logout } from '../services/AuthApi';

export default function ProfilePage() {
  const [user, setUser] = useState<any | null>(null);

  useEffect(() => {
    me()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('authToken');
        window.location.href = '/login';
      });
  }, []);

  function handleLogout() {
    logout().finally(() => {
      window.location.href = '/';
    });
  }

  if (!user) return <div className='min-h-screen flex items-center justify-center'>Carregando...</div>;

  return (
    <div className='min-h-screen bg-gray-50'>
      <div className='max-w-3xl mx-auto p-8'>
        <h1 className='text-2xl font-bold mb-4'>Perfil</h1>
        <div className='bg-white p-6 rounded shadow'>
          <p><strong>Usuário:</strong> {user.username}</p>
          <p><strong>Email:</strong> {user.email || '-'}</p>
          <div className='mt-4'>
            <button onClick={handleLogout} className='bg-red-600 text-white px-4 py-2 rounded'>Sair</button>
          </div>
        </div>
      </div>
    </div>
  );
}
