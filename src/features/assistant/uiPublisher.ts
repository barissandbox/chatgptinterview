/** Publishes assistant UI updates to sidepanel and active tab. */
import { sendTabMessage } from '../../shared/messaging';
import type { TabMessage } from '../../shared/types';
import { setLastAnswer } from './conversationStore';

interface PublishAssistantAnswerOptions {
  streaming?: boolean;
}

/** Persists and publishes assistant answer updates to every visible assistant UI. */
export async function publishAssistantAnswer(
  tabId: number | null,
  answer: string,
  question?: string,
  options: PublishAssistantAnswerOptions = {}
): Promise<void> {
  if (!options.streaming) {
    await setLastAnswer(answer);
  }

  const message: TabMessage = {
    action: 'assistant.answer.render',
    answer,
    ...(question ? { question } : {}),
    ...(options.streaming ? { streaming: true } : {})
  };

  broadcastSidePanelMessage(message);
  if (tabId != null) {
    await sendTabMessage(tabId, message).catch(() => undefined);
  }
}

/** Publishes assistant status updates to side panel and optional page overlay. */
export async function publishAssistantStatus(
  tabId: number | null,
  status: string,
  tone: 'status' | 'error' = 'status'
): Promise<void> {
  broadcastSidePanelMessage({ action: 'assistant.status.render', status, tone });
  if (tabId != null) {
    await sendTabMessage(tabId, { action: 'assistant.status.render', status, tone }).catch(() => undefined);
  }
}

/** Broadcasts side-panel UI messages while tolerating no active receivers. */
export function broadcastSidePanelMessage(message: TabMessage): void {
  void chrome.runtime.sendMessage(message).catch(() => undefined);
}
