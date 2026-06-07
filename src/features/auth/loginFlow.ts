/** Coordinates ChatGPT OAuth state and extension authentication storage. */
import { STORAGE_KEYS } from '../../shared/settings';
import { APP_URLS } from '../../shared/constants';
import { broadcastRuntimeMessage } from '../../shared/messaging';
import { getStorage, removeStorage, setStorage } from '../../shared/storage';
import { getErrorMessage } from '../../shared/errors';
import {
  buildAuthorizationUrl,
  createAccessContextFromAccessToken,
  exchangeAuthorizationCode,
  persistTokenResult,
  refreshStoredLimitInfo
} from '../../api/chatgpt';
import { fetchLatestModelsData } from '../../api/chatgpt';
import { base64UrlRandom, createCodeChallenge } from './pkceGenerator';
import type { CatalogStorage, PendingOAuth, Result } from '../../shared/types';

/** Opens a new tab at the given URL. */
async function openTab(url: string): Promise<chrome.tabs.Tab> {
  return chrome.tabs.create({ url });
}

/** Closes a tab by id, suppressing errors for already-closed tabs. */
async function closeTab(tabId: number): Promise<void> {
  await chrome.tabs.remove(tabId).catch(() => undefined);
}

/** Starts the OAuth PKCE flow and stores the verifier plus state for the callback step. */
export async function startLogin(): Promise<Result> {
  const verifier = base64UrlRandom(32);
  const state = base64UrlRandom(16);
  const challenge = await createCodeChallenge(verifier);
  const authorizationUrl = buildAuthorizationUrl(state, challenge);

  const tab = await openTab(authorizationUrl);
  const pendingOAuthBase: PendingOAuth = {
    state,
    verifier,
    startedAt: Date.now()
  };
  const pendingOAuth: PendingOAuth = tab.id == null
    ? pendingOAuthBase
    : { ...pendingOAuthBase, tabId: tab.id };

  const { auth = {} } = await getStorage('auth');
  await setStorage({ auth: { ...auth, pendingOAuth } });
  return { ok: true };
}

/** Checks whether a tab update URL is the extension's OAuth callback URL. */
export function isOAuthCallbackUrl(url = ''): boolean {
  return url.startsWith(APP_URLS.oauthRedirect);
}

/** Completes the OAuth flow, stores tokens, and closes the callback tab. */
export async function handleOAuthCallback(
  callbackUrl: string,
  tabId: number
): Promise<void> {
  const { auth } = await getStorage('auth');
  if (!auth?.pendingOAuth) {
    return;
  }

  const parsed = parseCallbackUrl(callbackUrl);
  if (!parsed.code) {
    await finishOAuthError('The ChatGPT callback did not include an authorization code.');
    return;
  }

  if (parsed.state && parsed.state !== auth.pendingOAuth.state) {
    await finishOAuthError('OAuth state mismatch. Please try signing in again.');
    return;
  }

  try {
    const tokenResult = await exchangeAuthorizationCode(parsed.code, auth.pendingOAuth.verifier);
    await persistTokenResult(tokenResult);
    const accessContext = createAccessContextFromAccessToken(tokenResult.accessToken);
    const catalog: CatalogStorage = {
      limitInfo: await refreshStoredLimitInfo(accessContext)
    };
    try {
      const refreshedModels = await fetchLatestModelsData(accessContext);
      catalog.availableModels = refreshedModels.availableModels;
      catalog.codexClientVersion = refreshedModels.clientVersion;
    } catch (error) {
      console.warn('Unable to load ChatGPT models after login.', error);
    }
    const stored = await getStorage('auth');
    const { pendingOAuth: _pendingOAuth, ...authWithoutPending } = stored.auth || {};
    await setStorage({
      auth: authWithoutPending,
      catalog
    });
    await closeTab(tabId);
    broadcastRuntimeMessage({ action: 'event.authChanged' });
  } catch (error) {
    await finishOAuthError(getErrorMessage(error, 'ChatGPT login failed.'));
  }
}

/** Throws if the extension is not currently signed in to ChatGPT. */
export async function ensureAuthenticated(): Promise<void> {
  if (!(await isLoggedIn())) {
    throw new Error('Please sign in with ChatGPT first.');
  }
}

/** Reports whether the extension has any stored auth credentials. */
export async function isLoggedIn(): Promise<boolean> {
  const { auth } = await getStorage('auth');
  return Boolean(auth?.accessToken || auth?.refreshToken);
}

/** Clears all stored auth and UI state, then notifies popup listeners. */
export async function signOut(): Promise<Result> {
  await removeStorage(STORAGE_KEYS);
  broadcastRuntimeMessage({ action: 'event.authChanged' });
  return { ok: true };
}

/** Clears pending OAuth state and publishes an authentication error to the popup. */
async function finishOAuthError(message: string): Promise<void> {
  const { auth = {} } = await getStorage('auth');
  const { pendingOAuth: _pendingOAuth, ...authWithoutPending } = auth;
  await setStorage({ auth: { ...authWithoutPending, error: message } });
  broadcastRuntimeMessage({ action: 'event.authChanged', error: message });
}

/** Extracts the OAuth authorization code and state from the callback URL. */
function parseCallbackUrl(url: string): { code: string; state: string } {
  const parsed = new URL(url);
  return {
    code: parsed.searchParams.get('code') || '',
    state: parsed.searchParams.get('state') || ''
  };
}
