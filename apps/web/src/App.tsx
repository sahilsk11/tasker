import { Route, Routes } from "react-router";
import { HomePage } from "@/pages/Home/HomePage";

export function App(): React.JSX.Element {
  return (
    <Routes>
      <Route index element={<HomePage />} />
    </Routes>
  );
}
