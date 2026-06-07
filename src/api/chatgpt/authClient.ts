/** ChatGPT OAuth token client and access-context storage helpers. */
import { getStorage, setStorage } from '../../shared/storage';
import { APP_URLS, CHATGPT_CLIENT, CHATGPT_JWT_CLAIMS, buildUrl } from '../../shared/constants';
import type { AccessContext, TokenResult } from '../../shared/types';
import { readJwtClaim } from './jwtDecoder';

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Builds the ChatGPT OAuth authorization URL for the PKCE flow. */
export function buildAuthorizationUrl(state: string, challenge: string): string {
  return buildUrl(APP_URLS.chatgptAuth, {
    response_type: 'code',
    client_id: CHATGPT_CLIENT.id,
    redirect_uri: APP_URLS.oauthRedirect,
    scope: CHATGPT_CLIENT.scope,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    originator: CHATGPT_CLIENT.originator
  });
}

/** Exchanges an OAuth authorization code for access and refresh tokens. */
export async function exchangeAuthorizationCode(code: string, verifier: string): Promise<TokenResult> {
  const response = await fetch(APP_URLS.chatgptToken, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: CHATGPT_CLIENT.id,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: APP_URLS.oauthRedirect
    })
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed with status ${response.status}.`);
  }

  return parseTokenResponse(await response.json());
}

/** Persists token data and account metadata extracted from the access token. */
export async function persistTokenResult(tokenResult: TokenResult): Promise<void> {
  const email = readJwtClaim(tokenResult.accessToken, [...CHATGPT_JWT_CLAIMS.profileEmail])
    || readJwtClaim(tokenResult.accessToken, ['email']);
  const chatgptAccountId = readJwtClaim(tokenResult.accessToken, [...CHATGPT_JWT_CLAIMS.accountId]);

  await setStorage({
    auth: {
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
      expiresAt: tokenResult.expiresAt,
      accountEmail: email || null,
      chatgptAccountId: chatgptAccountId || null,
      error: null
    }
  });
}

/** Creates a request context from an already valid ChatGPT access token. */
export function createAccessContextFromAccessToken(accessToken: string): AccessContext {
  return {
    accessToken,
    chatgptAccountId: readJwtClaim(accessToken, [...CHATGPT_JWT_CLAIMS.accountId])
  };
}

/** Returns a valid ChatGPT access context, refreshing credentials when needed. */
export async function getValidAccessContext(): Promise<AccessContext> {
  const { auth } = await getStorage('auth');
  if (!auth?.refreshToken && !auth?.accessToken) {
    throw new Error('Please sign in with ChatGPT first.');
  }

  if (auth.accessToken && auth.expiresAt && auth.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    return {
      accessToken: auth.accessToken,
      chatgptAccountId: auth.chatgptAccountId || readJwtClaim(auth.accessToken, [...CHATGPT_JWT_CLAIMS.accountId])
    };
  }

  if (!auth.refreshToken) {
    throw new Error('Your ChatGPT session expired. Please sign in again.');
  }

  const tokenResult = await refreshAccessToken(auth.refreshToken);
  await persistTokenResult(tokenResult);
  return {
    accessToken: tokenResult.accessToken,
    chatgptAccountId: readJwtClaim(tokenResult.accessToken, [...CHATGPT_JWT_CLAIMS.accountId])
  };
}

/** Refreshes ChatGPT access credentials with a stored refresh token. */
async function refreshAccessToken(refreshToken: string): Promise<TokenResult> {
  const response = await fetch(APP_URLS.chatgptToken, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CHATGPT_CLIENT.id
    })
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed with status ${response.status}.`);
  }

  return parseTokenResponse(await response.json());
}

/** Validates and normalizes the OAuth token response payload. */
function parseTokenResponse(data: unknown): TokenResult {
  const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : '';
  const refreshToken = typeof payload.refresh_token === 'string' ? payload.refresh_token : '';
  const expiresIn = typeof payload.expires_in === 'number' || typeof payload.expires_in === 'string'
    ? Number(payload.expires_in)
    : NaN;

  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn)) {
    throw new Error('ChatGPT returned an invalid token response.');
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000
  };
}
