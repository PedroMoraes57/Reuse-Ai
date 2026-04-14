import { ClassificationPageContent } from '../components/Classification/Classificationpage';
import Footer from '../components/LandingPage/Footer';
import Navbar from '../components/LandingPage/Navbar';

export default function ClassificationPage() {
  return (
    <>
      <Navbar isStatic forceScrolled />
      <ClassificationPageContent />
      <div id='contato'>
        <Footer />
      </div>
    </>
  );
}
