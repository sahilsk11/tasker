type ViteEnv = {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_TASKER_CHAT_LOCAL_PATH?: string;
};

const viteEnv = import.meta.env as unknown as ViteEnv;
const rawApiBaseUrl = viteEnv.VITE_API_BASE_URL ?? "";
const trimmedApiBaseUrl = rawApiBaseUrl.replace(/\/$/u, "");

export const apiBaseUrl = trimmedApiBaseUrl.length > 0 ? trimmedApiBaseUrl : "/api";

export const defaultChatLocalPath =
  viteEnv.VITE_TASKER_CHAT_LOCAL_PATH ?? "/Users/sahil/portfolio/tasker-session-coordinator";
