export function requireLoopbackApiUrl(
  value,
  {
    invalidMessage = "Refusing non-loopback API URL",
    missingMessage = "Set TASKER_API_BASE_URL to the local API URL"
  } = {}
) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(missingMessage);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(invalidMessage);
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error(invalidMessage);
  }

  return url;
}
