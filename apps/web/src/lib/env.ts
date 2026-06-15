type ViteEnv = {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_LOCAL_API_BASE_URL?: string;
};

const viteEnv = import.meta.env as unknown as ViteEnv;
const rawApiBaseUrl = viteEnv.VITE_API_BASE_URL ?? "";
const trimmedApiBaseUrl = rawApiBaseUrl.replace(/\/$/u, "");
const rawLocalApiBaseUrl = viteEnv.VITE_LOCAL_API_BASE_URL ?? "";
const trimmedLocalApiBaseUrl = rawLocalApiBaseUrl.replace(/\/$/u, "");

export const apiBaseUrl = trimmedApiBaseUrl.length > 0 ? trimmedApiBaseUrl : "/api";
export const localApiBaseUrl =
  trimmedLocalApiBaseUrl.length > 0
    ? trimmedLocalApiBaseUrl
    : "http://127.0.0.1:3000";
