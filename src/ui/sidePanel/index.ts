/** Chrome side panel entrypoint for the persistent interview assistant UI. */
import { isRuntimeEventMessage, isTabMessage, sendRuntimeMessage } from '../../shared/messaging';
import {
  renderAssistantAnswer,
  renderAssistantStatus,
  renderTranscript,
  showAssistantOverlay
} from '../content/overlayController';

document.documentElement.classList.add('civ-sidepanel');
document.addEventListener('DOMContentLoaded', () => {
  void refreshSidePanel();
});

chrome.runtime.onMessage.addListener((incoming: unknown) => {
  if (isTabMessage(incoming)) {
    if (incoming.action === 'assistant.answer.render') {
      renderAssistantAnswer(incoming.answer, incoming.question, incoming.streaming === true);
      return false;
    }
    if (incoming.action === 'assistant.status.render') {
      renderAssistantStatus(incoming.status, incoming.tone);
      return false;
    }
    if (incoming.action === 'assistant.transcript.render') {
      renderTranscript(incoming.text, incoming.speaker, incoming.isFinal);
      return false;
    }
  }

  if (isRuntimeEventMessage(incoming) && (incoming.action === 'event.authChanged' || incoming.action === 'event.assistantUpdated')) {
    void refreshSidePanel();
  }
  return false;
});

/** Loads current extension status and renders the side-panel assistant shell. */
async function refreshSidePanel(): Promise<void> {
  const status = await sendRuntimeMessage({ action: 'status.get' });
  if (!status.ok) {
    renderAssistantStatus(status.error || 'Could not load assistant status.', 'error');
    return;
  }

  showAssistantOverlay({
    action: 'assistant.show',
    loggedIn: status.auth.loggedIn,
    accountEmail: status.auth.accountEmail,
    lastAnswer: status.assistant.lastAnswer,
    conversation: status.assistant.conversation,
    language: status.settings.language,
    answerType: status.settings.answerType,
    targetPosition: status.settings.targetPosition
  });
}
