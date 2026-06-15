import { Route, Routes } from "react-router";
import { ArtifactPage } from "@/pages/Artifact/ArtifactPage";
import { HomePage } from "@/pages/Home/HomePage";

export function App(): React.JSX.Element {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="/tasks/:taskId/artifacts/:artifactId" element={<ArtifactPage />} />
    </Routes>
  );
}
