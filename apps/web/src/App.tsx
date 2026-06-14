import { Route, Routes } from "react-router";
import { ChatPage } from "@/pages/Chat/ChatPage";
import { HomePage } from "@/pages/Home/HomePage";

export function App(): React.JSX.Element {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="chat" element={<ChatPage />} />
    </Routes>
  );
}
