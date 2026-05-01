const INVALID_API_KEY_PATTERNS = [
  "invalid api key",
  "invalid_api_key",
  "api key is invalid",
];

export const INVALID_GROQ_API_KEY_MESSAGE =
  "AI provider key is invalid. Update GROQ_API_KEY in .env.local and restart the dev servers.";

const toSearchableString = (value: unknown): string => {
  if (typeof value === "string") {
    return value.toLowerCase();
  }

  if (value instanceof Error) {
    return `${value.name} ${value.message}`.toLowerCase();
  }

  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value).toLowerCase();
    } catch {
      return "";
    }
  }

  if (value == null) {
    return "";
  }

  return String(value).toLowerCase();
};

export const isInvalidProviderApiKeyError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const providerError = error as {
    statusCode?: unknown;
    message?: unknown;
    responseBody?: unknown;
    data?: unknown;
    cause?: unknown;
  };

  const statusCode =
    typeof providerError.statusCode === "number"
      ? providerError.statusCode
      : undefined;

  const combined = [
    providerError.message,
    providerError.responseBody,
    providerError.data,
    providerError.cause,
  ]
    .map(toSearchableString)
    .join(" ");

  const hasInvalidKeyPattern = INVALID_API_KEY_PATTERNS.some((pattern) =>
    combined.includes(pattern)
  );

  if (hasInvalidKeyPattern) {
    return true;
  }

  return statusCode === 401 && combined.includes("api key");
};

export const isAbortLikeError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const requestError = error as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    cause?: unknown;
  };

  const name = typeof requestError.name === "string" ? requestError.name : "";
  const code = typeof requestError.code === "string" ? requestError.code : "";
  const causeCode =
    typeof requestError.cause === "object" && requestError.cause !== null
      ? (requestError.cause as { code?: unknown }).code
      : undefined;
  const causeCodeString =
    typeof causeCode === "string" ? causeCode : "";

  if (name === "AbortError") {
    return true;
  }

  if (code === "ECONNRESET" || causeCodeString === "ECONNRESET") {
    return true;
  }

  const message = toSearchableString(requestError.message);
  return message.includes("aborted") || message.includes("aborterror");
};