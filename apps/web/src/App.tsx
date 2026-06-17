import { Route, Routes } from "react-router";
import { ArtifactPage } from "@/pages/Artifact/ArtifactPage";
import { BreakdownPreviewPage } from "@/pages/Breakdown/BreakdownPreviewPage";
import { HomePage } from "@/pages/Home/HomePage";

export function App(): React.JSX.Element {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="/breakdowns/preview" element={<BreakdownPreviewPage />} />
      <Route path="/tasks/:taskId/artifacts/:artifactId" element={<ArtifactPage />} />
    </Routes>
  );
}
