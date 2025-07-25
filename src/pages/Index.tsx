import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import FeatureShowcase from "@/components/FeatureShowcase";
import WorkflowDemo from "@/components/WorkflowDemo";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <HeroSection />
      <FeatureShowcase />
      <WorkflowDemo />
    </div>
  );
};

export default Index;