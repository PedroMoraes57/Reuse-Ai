import Navbar from '../components/Navbar';
import HeroSection from '../components/HeroSection';
import WorkSection from '../components/WorkSection';
import ProblemSection from '../components/ProblemSection';
import TresPassos from '../components/TresPassos';
import BinSection from '../components/Lixeiras';
import ImpactoReal from '../components/ImpactoReal';
import Avaliacoes from '../components/Avaliacoes';

function LandingPage() {
  return (
    <>
      <Navbar />
      {/* Sem pt-20 aqui pois a hero ocupa a tela toda por baixo da navbar */}
      <main>
        <HeroSection />
        <WorkSection />
        <ProblemSection />
        <TresPassos />
        <BinSection />
        <ImpactoReal />
        <Avaliacoes />
      </main>
    </>
  );
}

export default LandingPage;
