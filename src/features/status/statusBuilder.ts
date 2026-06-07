/** Builds popup/sidepanel status payloads and persists assistant settings. */
import {
  DEFAULT_CODEX_CLIENT_VERSION,
  normalizeAssistantSettings,
  normalizeAvailableModelsCatalog
} from '../../shared/settings';
import { broadcastRuntimeMessage } from '../../shared/messaging';
import { getStorage, setStorage } from '../../shared/storage';
import {
  fetchAndStoreLimitInfo,
  fetchLatestModelsData,
  getValidAccessContext,
  hasRenderableLimitInfo,
  normalizeLimitInfo
} from '../../api/chatgpt';
import type {
  AccessContext,
  AssistantLanguage,
  AssistantSettings,
  AnswerType,
  AvailableModel,
  ResponseStyle,
  Result,
  StatusPayload,
  ThinkingVariant
} from '../../shared/types';

/** Builds the full status payload consumed by popup and side panel pages. */
export async function getStatus(): Promise<StatusPayload> {
  const data = await getStorage(['auth', 'settings', 'profile', 'assistant', 'deepgram', 'catalog'] as const);
  let catalog = data.catalog || {};
  let normalizedLimitInfo = normalizeLimitInfo(catalog.limitInfo ?? null);
  let availableModels = normalizeAvailableModelsCatalog(catalog.availableModels);
  let codexClientVersion = typeof catalog.codexClientVersion === 'string' && catalog.codexClientVersion.trim()
    ? catalog.codexClientVersion
    : DEFAULT_CODEX_CLIENT_VERSION;

  if (isSignedIn(data.auth) && !hasRenderableLimitInfo(normalizedLimitInfo)) {
    try {
      const refreshedLimitInfo = await fetchAndStoreLimitInfo(await getValidAccessContext());
      catalog = {
        ...catalog,
        limitInfo: refreshedLimitInfo,
        limitInfoUpdatedAt: Date.now()
      };
      normalizedLimitInfo = normalizeLimitInfo(refreshedLimitInfo);
    } catch (error) {
      console.warn('Unable to load ChatGPT limit info for status.', error);
    }
  }

  if (isSignedIn(data.auth) && availableModels.length === 0) {
    try {
      const refreshedModels = await refreshModelCatalog(await getValidAccessContext());
      availableModels = refreshedModels.availableModels;
      codexClientVersion = refreshedModels.clientVersion;
      catalog = {
        ...catalog,
        availableModels,
        codexClientVersion
      };
    } catch (error) {
      console.warn('Unable to load ChatGPT models for status.', error);
    }
  }

  const settings = normalizeAssistantSettings(data.settings, availableModels);
  const profile = data.profile || {};
  const assistant = data.assistant || {};
  const conversation = Array.isArray(assistant.conversation) ? assistant.conversation : [];
  const deepgram = data.deepgram || {};

  return {
    ok: true,
    auth: {
      loggedIn: isSignedIn(data.auth),
      accountEmail: data.auth?.accountEmail || '',
      error: data.auth?.error || '',
      expiresAt: data.auth?.expiresAt || null
    },
    settings,
    profile: {
      fileName: typeof profile.fileName === 'string' ? profile.fileName : '',
      text: typeof profile.text === 'string' ? profile.text : '',
      updatedAt: typeof profile.updatedAt === 'number' && Number.isFinite(profile.updatedAt)
        ? profile.updatedAt
        : null
    },
    assistant: {
      lastAnswer: assistant.lastAnswer || '',
      conversation
    },
    catalog: {
      limitInfo: normalizedLimitInfo,
      limitInfoUpdatedAt: typeof catalog.limitInfoUpdatedAt === 'number' && Number.isFinite(catalog.limitInfoUpdatedAt)
        ? catalog.limitInfoUpdatedAt
        : null,
      availableModels,
      codexClientVersion
    },
    deepgram: {
      apiKeySaved: Boolean(typeof deepgram.apiKey === 'string' && deepgram.apiKey.trim()),
      balanceLabel: typeof deepgram.balanceLabel === 'string' ? deepgram.balanceLabel : ''
    }
  };
}

/** Refreshes ChatGPT usage limits and notifies extension UIs. */
export async function refreshLimits(): Promise<Result> {
  await fetchAndStoreLimitInfo(await getValidAccessContext());
  broadcastRuntimeMessage({ action: 'event.assistantUpdated' });
  return { ok: true };
}

/** Refreshes the ChatGPT model catalog and notifies extension UIs. */
export async function refreshModels(): Promise<Result> {
  await refreshModelCatalog(await getValidAccessContext());
  broadcastRuntimeMessage({ action: 'event.assistantUpdated' });
  return { ok: true };
}

/** Returns the currently selected assistant model after catalog normalization. */
export async function getAssistantModel(): Promise<string> {
  return (await getNormalizedSettings()).model;
}

/** Returns the currently selected reasoning effort after catalog normalization. */
export async function getAssistantThinkingVariant(): Promise<ThinkingVariant> {
  return (await getNormalizedSettings()).thinkingVariant;
}

/** Returns the selected response verbosity after settings normalization. */
export async function getAssistantVerbosity(): Promise<ResponseStyle> {
  return (await getNormalizedSettings()).verbosity;
}

/** Returns whether priority service tier is enabled after settings normalization. */
export async function getAssistantFastEnabled(): Promise<boolean> {
  return (await getNormalizedSettings()).fastEnabled;
}

/** Returns the currently selected transcript language after settings normalization. */
export async function getAssistantLanguage(): Promise<AssistantLanguage> {
  return (await getNormalizedSettings()).language;
}

/** Returns the selected answer format after settings normalization. */
export async function getAssistantAnswerType(): Promise<AnswerType> {
  return (await getNormalizedSettings()).answerType;
}

/** Returns the optional target position after settings normalization. */
export async function getAssistantTargetPosition(): Promise<string> {
  return (await getNormalizedSettings()).targetPosition;
}

/** Loads persisted settings and normalizes them against the current model catalog. */
async function getNormalizedSettings(): Promise<Required<AssistantSettings>> {
  const { settings, catalog } = await getStorage(['settings', 'catalog'] as const);
  return normalizeAssistantSettings(settings, normalizeAvailableModelsCatalog(catalog?.availableModels));
}

/** Persists partial assistant settings without overwriting unrelated fields. */
export async function saveAssistantSettings(nextSettings: {
  model?: string;
  thinkingVariant?: ThinkingVariant;
  verbosity?: ResponseStyle;
  fastEnabled?: boolean;
  language?: AssistantLanguage;
  answerType?: AnswerType;
  targetPosition?: string;
}): Promise<void> {
  const { settings = {} } = await getStorage('settings');
  await setStorage({
    settings: {
      ...settings,
      ...nextSettings
    }
  });
}

/** Fetches the latest model catalog and stores it for subsequent status reads. */
async function refreshModelCatalog(accessContext: AccessContext): Promise<{
  availableModels: AvailableModel[];
  clientVersion: string;
}> {
  const refreshedModels = await fetchLatestModelsData(accessContext);
  const { catalog = {} } = await getStorage('catalog');
  await setStorage({
    catalog: {
      ...catalog,
      availableModels: refreshedModels.availableModels,
      codexClientVersion: refreshedModels.clientVersion
    }
  });
  return refreshedModels;
}

/** Checks whether stored auth contains credentials that can be refreshed or used. */
function isSignedIn(auth: { accessToken?: string; refreshToken?: string } | undefined): boolean {
  return Boolean(auth?.accessToken || auth?.refreshToken);
}
