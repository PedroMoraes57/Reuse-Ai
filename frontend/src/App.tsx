import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import ClassificationPage from './pages/ClassificationPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* path="/" significa a rota raiz, ou seja, localhost:5173 */}
        <Route path='/' element={<LandingPage />} />
        <Route path='/classificar' element={<ClassificationPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
