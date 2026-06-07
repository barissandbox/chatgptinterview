/** Service worker entrypoint for the ChatGPT Interview extension. */
import { isOAuthCallbackUrl, handleOAuthCallback } from '../features/auth';
import { routeRuntimeMessage } from './messageRouter';
import { runFireAndForget } from './taskRunner';

chrome.runtime.onMessage.addListener(routeRuntimeMessage);

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && isOAuthCallbackUrl(changeInfo.url)) {
    runFireAndForget(
      handleOAuthCallback(changeInfo.url, tabId),
      'OAuth callback'
    );
  }
});
