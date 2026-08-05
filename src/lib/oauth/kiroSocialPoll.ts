export type KiroSocialPollData = {
  error?: unknown;
  pending?: unknown;
  status?: unknown;
  accessToken?: unknown;
  refreshToken?: unknown;
};

export type KiroSocialPollOutcome =
  | { kind: "pending"; error: "authorization_pending" | "slow_down" }
  | { kind: "error"; error: string; status: number }
  | { kind: "success" };

/**
 * RFC 8628 requires every later device-code poll to retain a `slow_down`
 * increase. Keeping this transition pure makes the UI retry behaviour testable.
 */
export function getNextKiroSocialPollInterval(currentIntervalMs: number, error: unknown): number {
  return error === "slow_down" ? currentIntervalMs + 5000 : currentIntervalMs;
}

function errorCode(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "authorization_failed";
}

export function classifyKiroSocialPoll(
  responseOk: boolean,
  responseStatus: number,
  data: KiroSocialPollData | null | undefined
): KiroSocialPollOutcome {
  const pollData = data && typeof data === "object" ? data : {};

  if (pollData.error === "authorization_pending" || pollData.error === "slow_down") {
    return { kind: "pending", error: pollData.error };
  }

  if (pollData.pending === true || pollData.status === "pending") {
    return { kind: "pending", error: "authorization_pending" };
  }

  if (!responseOk || pollData.error) {
    const status = responseStatus >= 400 && responseStatus <= 599 ? responseStatus : 400;
    return { kind: "error", error: errorCode(pollData.error), status };
  }

  // === CHANGE: keep empty successful polls pending while social authorization is unfinished ===
  if (!pollData.accessToken && !pollData.refreshToken) {
    return { kind: "pending", error: "authorization_pending" };
  }

  return { kind: "success" };
}
