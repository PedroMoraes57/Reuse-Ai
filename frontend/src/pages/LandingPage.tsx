import Navbar from '../components/LandingPage/Navbar';
import HeroSection from '../components/LandingPage/HeroSection';
import WorkSection from '../components/LandingPage/WorkSection';
import ProblemSection from '../components/LandingPage/ProblemSection';
import TresPassos from '../components/LandingPage/TresPassos';
import BinSection from '../components/LandingPage/Lixeiras';
import ImpactoReal from '../components/LandingPage/ImpactoReal';
import Avaliacoes from '../components/LandingPage/Avaliacoes';
import CTA from '../components/LandingPage/CTA';
import Footer from '../components/LandingPage/Footer';

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
        <CTA />
      </main>
      <Footer />
    </>
  );
}

export default LandingPage;
