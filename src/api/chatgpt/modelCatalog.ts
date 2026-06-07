/** ChatGPT model catalog client and normalization helpers. */
import { DEFAULT_CODEX_CLIENT_VERSION, normalizeAvailableModelsCatalog } from '../../shared/settings';
import { APP_URLS, buildUrl } from '../../shared/constants';
import { asRecord } from '../../shared/records';
import type { AccessContext, AvailableModel, ThinkingVariant } from '../../shared/types';
import { createChatGptRequestHeaders } from './headersFactory';

interface AvailableModelWithPriority extends AvailableModel {
  priority: number;
}

/** Returns the bundled fallback Codex client version. */
export function getDefaultCodexClientVersion(): string {
  return DEFAULT_CODEX_CLIENT_VERSION;
}

/** Fetches the latest Codex client version, falling back to the bundled default. */
export async function fetchLatestCodexClientVersion(): Promise<string> {
  try {
    const response = await fetch(APP_URLS.codexLatestPackage, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
      throw new Error(`Codex version lookup failed with status ${response.status}.`);
    }

    const payload = asRecord(await response.json());
    const version = typeof payload.version === 'string' ? payload.version.trim() : '';
    return isValidCodexVersion(version) ? version : DEFAULT_CODEX_CLIENT_VERSION;
  } catch (error) {
    console.warn('Unable to fetch latest Codex client version.', error);
    return DEFAULT_CODEX_CLIENT_VERSION;
  }
}

/** Fetches available ChatGPT Codex models for the provided client version. */
export async function fetchAvailableModels(accessContext: AccessContext, clientVersion: string): Promise<AvailableModel[]> {
  const response = await fetch(buildUrl(APP_URLS.chatgptModels, { client_version: clientVersion }), {
    method: 'GET',
    headers: createChatGptRequestHeaders(accessContext, 'application/json', false)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ChatGPT models check failed with status ${response.status}.${body ? ` ${body.slice(0, 240)}` : ''}`);
  }

  return normalizeAvailableModelsPayload(await response.json());
}

/** Fetches and normalizes both model catalog and client-version metadata. */
export async function fetchLatestModelsData(accessContext: AccessContext): Promise<{
  availableModels: AvailableModel[];
  clientVersion: string;
}> {
  const clientVersion = await fetchLatestCodexClientVersion();

  return {
    availableModels: normalizeAvailableModelsCatalog(await fetchAvailableModels(accessContext, clientVersion)),
    clientVersion
  };
}

/** Normalizes the raw ChatGPT models payload and guarantees a default model. */
function normalizeAvailableModelsPayload(payload: unknown): AvailableModel[] {
  const root = asRecord(payload);
  const items = Array.isArray(root.models) ? root.models : [];
  const normalized = items
    .map(normalizeAvailableModel)
    .filter((model): model is AvailableModelWithPriority => model !== null)
    .sort((a, b) => a.priority - b.priority || a.displayName.localeCompare(b.displayName))
    .map(({ priority: _priority, ...model }) => model);

  if (normalized.length === 0) {
    throw new Error('ChatGPT returned an empty models catalog.');
  }

  if (!normalized.some((model) => model.isDefault)) {
    const firstVisibleIndex = normalized.findIndex((model) => !model.hidden);
    const fallbackIndex = firstVisibleIndex >= 0 ? firstVisibleIndex : 0;
    if (normalized[fallbackIndex]) {
      normalized[fallbackIndex] = {
        ...normalized[fallbackIndex],
        isDefault: true
      };
    }
  }

  return normalized;
}

/** Normalizes a single raw model entry into the extension's model shape. */
function normalizeAvailableModel(item: unknown): AvailableModelWithPriority | null {
  const data = asRecord(item);
  const slug = normalizeOptionalString(data.slug);
  const model = normalizeOptionalString(slug || data.model || data.id);
  if (!model) {
    return null;
  }

  const inputModalities = Array.isArray(data.input_modalities)
    ? data.input_modalities
      .map((value) => normalizeOptionalString(value).toLowerCase())
      .filter((value): value is 'text' | 'image' => value === 'text' || value === 'image')
    : ['text', 'image'] as Array<'text' | 'image'>;
  const availableInPlans = Array.isArray(data.available_in_plans)
    ? data.available_in_plans
      .map((value) => normalizeOptionalString(value).toLowerCase())
      .filter((value): value is string => Boolean(value))
    : [];
  const hidden = data.hidden === true || normalizeOptionalString(data.visibility).toLowerCase() === 'hide';

  return {
    id: normalizeOptionalString(data.id) || model,
    model,
    displayName: slug || normalizeOptionalString(data.display_name || data.displayName) || model,
    description: normalizeOptionalString(data.description),
    availableInPlans,
    hidden,
    isDefault: data.is_default === true,
    inputModalities: inputModalities.length > 0 ? inputModalities : ['text', 'image'],
    defaultThinkingVariant: normalizeThinkingValue(data.default_reasoning_level) || 'medium',
    thinkingVariants: normalizeThinkingVariants(data.supported_reasoning_levels),
    priority: tryGetInt(data.priority) ?? Number.MAX_SAFE_INTEGER
  };
}

/** Normalizes supported reasoning levels for a model. */
function normalizeThinkingVariants(value: unknown): AvailableModel['thinkingVariants'] {
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .map((item) => {
      const data = asRecord(item);
      const thinkingValue = normalizeThinkingValue(data.effort);
      if (!thinkingValue) {
        return null;
      }
      return {
        value: thinkingValue,
        description: normalizeOptionalString(data.description) || thinkingValue
      };
    })
    .filter((item): item is AvailableModel['thinkingVariants'][number] => item !== null);

  return normalized.length > 0
    ? normalized
    : [{ value: 'medium', description: 'Balanced reasoning for everyday tasks' }];
}

/** Parses a reasoning effort value when it matches the supported enum. */
function normalizeThinkingValue(value: unknown): ThinkingVariant | null {
  const normalized = normalizeOptionalString(value).toLowerCase();
  return normalized === 'none'
    || normalized === 'minimal'
    || normalized === 'low'
    || normalized === 'medium'
    || normalized === 'high'
    || normalized === 'xhigh'
    ? normalized
    : null;
}

/** Parses integer-like values from model catalog fields. */
function tryGetInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  return null;
}

/** Normalizes optional strings from unknown API fields. */
function normalizeOptionalString(value: unknown): string {
  return String(value || '').trim();
}

/** Validates npm-style semantic versions returned for the Codex client. */
function isValidCodexVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value);
}
