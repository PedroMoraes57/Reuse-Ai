import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AssistantProvider } from './contexts/AssistantContext';
import { ThemeProvider } from './contexts/ThemeContext';
import AssistantWidget from './components/Assistant/AssistantWidget';
import LandingPage from './pages/LandingPage';
import ClassificationPage from './pages/ClassificationPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';

function App() {
  return (
    <ThemeProvider>
      <AssistantProvider>
        <BrowserRouter>
          <Routes>
            <Route path='/' element={<LandingPage />} />
            <Route path='/classificar' element={<ClassificationPage />} />
            <Route path='/login' element={<LoginPage />} />
            <Route path='/cadastro' element={<RegisterPage />} />
            <Route path='/profile' element={<ProfilePage />} />
          </Routes>
          <AssistantWidget />
        </BrowserRouter>
      </AssistantProvider>
    </ThemeProvider>
  );
}

export default App;
