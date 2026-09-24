export interface RestartStatus {
  bootId?: string;
  restart?: { available: boolean; reason?: string };
  restartPending?: boolean;
  restartRequired?: boolean;
}

/** Only a different, stable boot proves completion; an HTTP 200 from the old host does not. */
export async function waitForRestart(previousBoot: string, signal: AbortSignal, timeoutMs = 60000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let candidate: string | undefined;
  let since = 0;
  while (!signal.aborted && Date.now() < deadline) {
    try {
      const response = await fetch("/dsh-top100/status", { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) });
      const status = response.ok ? await response.json() as RestartStatus : null;
      if (typeof status?.bootId === "string" && status.bootId !== previousBoot) {
        if (candidate !== status.bootId) { candidate = status.bootId; since = Date.now(); }
        else if (Date.now() - since >= 8000) return;
      } else { candidate = undefined; }
    } catch { candidate = undefined; }
    await new Promise<void>((done) => {
      const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); done(); };
      const timer = setTimeout(finish, 1000);
      signal.addEventListener("abort", finish, { once: true });
      if (signal.aborted) finish();
    });
  }
  throw new Error(signal.aborted ? "restartCancelled" : "restartTimeout");
}
