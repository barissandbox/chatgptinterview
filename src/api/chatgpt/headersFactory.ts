/** Common ChatGPT backend request headers. */
import { CHATGPT_CLIENT } from '../../shared/constants';
import type { AccessContext } from '../../shared/types';

/** Builds authenticated ChatGPT headers and optional JSON content headers. */
export function createChatGptRequestHeaders(
  accessContext: AccessContext,
  accept: string,
  includeJsonContentType = true
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    Authorization: `Bearer ${accessContext.accessToken}`,
    originator: CHATGPT_CLIENT.originator
  };

  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
    headers['OpenAI-Beta'] = 'responses=experimental';
  }

  if (accessContext.chatgptAccountId) {
    headers['chatgpt-account-id'] = accessContext.chatgptAccountId;
  }

  return headers;
}
