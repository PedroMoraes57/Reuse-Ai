import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ThemeProvider } from './contexts/ThemeContext';
import { AssistantProvider } from './contexts/AssistantContext';
import AssistantWidget from './components/Assistant/AssistantWidget';
import OnboardingTutorial from './components/Onboarding/OnboardingTutorial';
import LandingPage from './pages/LandingPage';
import ClassificationPage from './pages/ClassificationPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import RankingPage from './pages/RankingPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import FriendsPage from './pages/FriendsPage';
import PublicProfilePage from './pages/PublicProfilePage';
import BattlePage from './pages/BattlePage';
import { pageTransition } from './utils/animations';

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode='wait'>
      <motion.div
        key={location.pathname}
        variants={pageTransition}
        initial='hidden'
        animate='visible'
        exit='exit'
      >
        <Routes location={location}>
          <Route path='/' element={<LandingPage />} />
          <Route path='/classificar' element={<ClassificationPage />} />
          <Route path='/login' element={<LoginPage />} />
          <Route path='/cadastro' element={<RegisterPage />} />
          <Route path='/profile' element={<ProfilePage />} />
          <Route path='/verificar-email' element={<VerifyEmailPage />} />
          <Route path='/ranking' element={<RankingPage />} />
          <Route path='/amigos' element={<FriendsPage />} />
          <Route path='/amigos/batalhas/:battleId' element={<BattlePage />} />
          <Route path='/usuarios/:username' element={<PublicProfilePage />} />
          <Route path='/esqueci-senha' element={<ForgotPasswordPage />} />
          <Route path='/recuperar-senha' element={<ResetPasswordPage />} />
        </Routes>
        <AssistantWidget />
      </motion.div>
    </AnimatePresence>
  );
}

function RoutedApp() {
  return (
    <AssistantProvider>
      <AnimatedRoutes />
      <OnboardingTutorial />
    </AssistantProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <RoutedApp />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
