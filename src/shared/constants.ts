/** Extension-wide immutable configuration constants. */

type HttpUrl = `http://${string}` | `https://${string}`;
type WebSocketUrl = `wss://${string}`;
type ExtensionFile = `${string}.${string}`;

type AppUrls = {
  developer: HttpUrl;
  source: HttpUrl;
  deepgramSignup: HttpUrl;
  deepgramProjects: HttpUrl;
  deepgramListen: WebSocketUrl;
  chatgptAuth: HttpUrl;
  chatgptToken: HttpUrl;
  chatgptResponses: HttpUrl;
  chatgptModels: HttpUrl;
  chatgptUsage: HttpUrl;
  codexLatestPackage: HttpUrl;
  oauthRedirect: HttpUrl;
};

type ExtensionPaths = {
  audioWorklet: ExtensionFile;
  contentScript: ExtensionFile;
  offscreenDocument: ExtensionFile;
  pdfWorker: ExtensionFile;
  sidePanel: ExtensionFile;
};

type ChatGptClientConfig = {
  id: string;
  originator: string;
  scope: string;
};

type ChatGptJwtClaims = {
  profileEmail: readonly [string, string];
  accountId: readonly [string, string];
};

export const APP_URLS = {
  developer: 'https://www.google.com',
  source: 'https://github.com/barissandbox/ChatGPTInterview',
  deepgramSignup: 'https://console.deepgram.com/signup',
  deepgramProjects: 'https://api.deepgram.com/v1/projects',
  deepgramListen: 'wss://api.deepgram.com/v1/listen',
  chatgptAuth: 'https://auth.openai.com/oauth/authorize',
  chatgptToken: 'https://auth.openai.com/oauth/token',
  chatgptResponses: 'https://chatgpt.com/backend-api/codex/responses',
  chatgptModels: 'https://chatgpt.com/backend-api/codex/models',
  chatgptUsage: 'https://chatgpt.com/backend-api/wham/usage',
  codexLatestPackage: 'https://registry.npmjs.org/@openai/codex/latest',
  oauthRedirect: 'http://localhost:1455/auth/callback'
} as const satisfies AppUrls;

export const EXTENSION_PATHS = {
  audioWorklet: 'audio-worklet.js',
  contentScript: 'content.js',
  offscreenDocument: 'offscreen.html',
  pdfWorker: 'pdf.worker.mjs',
  sidePanel: 'sidepanel.html'
} as const satisfies ExtensionPaths;

export const CHATGPT_CLIENT = {
  id: 'app_EMoamEEZ73f0CkXaXp7hrann',
  originator: 'codex_cli_rs',
  scope: 'openid profile email offline_access'
} as const satisfies ChatGptClientConfig;

export const CHATGPT_JWT_CLAIMS = {
  profileEmail: ['https://api.openai.com/profile', 'email'],
  accountId: ['https://api.openai.com/auth', 'chatgpt_account_id']
} as const satisfies ChatGptJwtClaims;

export type ExtensionPath = typeof EXTENSION_PATHS[keyof typeof EXTENSION_PATHS];

/** Resolves an extension-relative path to a full chrome-extension:// URL. */
export function getExtensionUrl(path: ExtensionPath): string {
  return chrome.runtime.getURL(path);
}

/** Builds a URL with query parameters from a base URL and params record. */
export function buildUrl(baseUrl: HttpUrl | WebSocketUrl, params: Record<string, string>): string {
  return `${baseUrl}?${new URLSearchParams(params).toString()}`;
}

/** Builds the Deepgram project balances API URL. */
export function buildDeepgramBalancesUrl(projectId: string): string {
  return `${APP_URLS.deepgramProjects}/${encodeURIComponent(projectId)}/balances`;
}
