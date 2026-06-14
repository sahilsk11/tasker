import { Route, Routes } from "react-router";
import { AssistantChatPage } from "@/pages/AssistantChat/AssistantChatPage";
import { HomePage } from "@/pages/Home/HomePage";

export function App(): React.JSX.Element {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="/chat-assistant-ui" element={<AssistantChatPage />} />
    </Routes>
  );
}
