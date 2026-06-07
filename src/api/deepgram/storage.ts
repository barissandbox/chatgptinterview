/** Local persistence helpers for Deepgram credentials and billing metadata. */
import { getStorage, removeStorage, setStorage } from '../../shared/storage';
import type { DeepgramStorage } from '../../shared/types';

interface SaveDeepgramApiKeyOptions {
  clearBalance?: boolean;
}

/** Reads the locally stored Deepgram state with defensive field normalization. */
export async function getDeepgramStorage(): Promise<DeepgramStorage> {
  const { deepgram } = await getStorage('deepgram');
  return normalizeDeepgramStorage(deepgram);
}

/** Persists the Deepgram API key and clears stale billing metadata when needed. */
export async function saveDeepgramApiKey(
  apiKey: string,
  options: SaveDeepgramApiKeyOptions = {}
): Promise<DeepgramStorage> {
  const normalizedApiKey = apiKey.trim();
  if (!normalizedApiKey) {
    await removeStorage('deepgram');
    return {};
  }

  const current = await getDeepgramStorage();
  const shouldClearBalance = options.clearBalance === true
    || Boolean(current.apiKey && current.apiKey !== normalizedApiKey);
  const nextStorage: DeepgramStorage = shouldClearBalance
    ? { apiKey: normalizedApiKey }
    : { ...current, apiKey: normalizedApiKey };

  await setStorage({ deepgram: nextStorage });
  return nextStorage;
}

/** Stores the latest Deepgram balance snapshot for display without a network call. */
export async function saveDeepgramBalance(apiKey: string, balanceLabel: string): Promise<DeepgramStorage> {
  const normalizedApiKey = apiKey.trim();
  const current = await getDeepgramStorage();
  const nextStorage: DeepgramStorage = {
    ...(current.apiKey === normalizedApiKey ? current : {}),
    balanceLabel,
    balanceUpdatedAt: Date.now()
  };
  const storedApiKey = normalizedApiKey || current.apiKey;
  if (storedApiKey) {
    nextStorage.apiKey = storedApiKey;
  }

  await setStorage({ deepgram: nextStorage });
  return nextStorage;
}

function normalizeDeepgramStorage(value: unknown): DeepgramStorage {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const candidate = value as DeepgramStorage;
  const normalized: DeepgramStorage = {};
  if (typeof candidate.apiKey === 'string' && candidate.apiKey.trim()) {
    normalized.apiKey = candidate.apiKey.trim();
  }
  if (typeof candidate.balanceLabel === 'string' && candidate.balanceLabel.trim()) {
    normalized.balanceLabel = candidate.balanceLabel;
  }
  if (typeof candidate.balanceUpdatedAt === 'number' && Number.isFinite(candidate.balanceUpdatedAt)) {
    normalized.balanceUpdatedAt = candidate.balanceUpdatedAt;
  }
  return normalized;
}
