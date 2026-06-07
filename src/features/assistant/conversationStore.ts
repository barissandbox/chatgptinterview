/** Namespaced assistant conversation storage helpers. */
import { getStorage, setStorage } from '../../shared/storage';
import { looksLikeInterviewQuestion } from '../transcription/questionDetector';
import type { AssistantLanguage, ConversationMessage } from '../../shared/types';

const MAX_CONVERSATION_MESSAGES = 80;
const RECENT_AUTO_ANSWER_WINDOW_MS = 5 * 60 * 1000;

/** Appends bounded conversation messages to assistant storage. */
export async function appendConversation(messages: ConversationMessage[]): Promise<void> {
  const { assistant = {} } = await getStorage('assistant');
  const conversation = normalizeConversation(assistant.conversation)
    .concat(messages)
    .slice(-MAX_CONVERSATION_MESSAGES);
  await setStorage({ assistant: { ...assistant, conversation } });
}

/** Clears persisted assistant transcript, answer, and auto-detection state. */
export async function clearAssistantState(): Promise<void> {
  await setStorage({
    assistant: {
      conversation: [],
      lastAnswer: '',
      lastDetectedQuestion: '',
      lastAutoAnswerAt: 0
    }
  });
}

/** Stores the latest answer so popup and side panel reloads can recover it. */
export async function setLastAnswer(answer: string): Promise<void> {
  const { assistant = {} } = await getStorage('assistant');
  await setStorage({ assistant: { ...assistant, lastAnswer: answer } });
}

/** Records the latest automatically answered question for deduplication. */
export async function markAutoAnswer(question: string): Promise<void> {
  const { assistant = {} } = await getStorage('assistant');
  await setStorage({
    assistant: {
      ...assistant,
      lastDetectedQuestion: normalizeQuestionKey(question),
      lastAutoAnswerAt: Date.now()
    }
  });
}

/** Returns whether the same detected question was already answered recently. */
export async function hasRecentAutoAnswer(question: string): Promise<boolean> {
  const { assistant } = await getStorage('assistant');
  const lastAutoAnswerAt = typeof assistant?.lastAutoAnswerAt === 'number'
    ? assistant.lastAutoAnswerAt
    : 0;
  const lastDetectedQuestion = typeof assistant?.lastDetectedQuestion === 'string'
    ? assistant.lastDetectedQuestion
    : '';

  return Boolean(
    lastDetectedQuestion
    && lastDetectedQuestion === normalizeQuestionKey(question)
    && Date.now() - lastAutoAnswerAt < RECENT_AUTO_ANSWER_WINDOW_MS
  );
}

/** Returns the latest question-like transcript message, falling back to recent text. */
export async function getLatestTranscriptQuestion(language?: AssistantLanguage): Promise<string> {
  const { assistant } = await getStorage('assistant');
  const messages = normalizeConversation(assistant?.conversation)
    .filter((message) => message.role !== 'assistant')
    .slice(-20);

  const questionLikeMessage = [...messages].reverse().find((message) => looksLikeInterviewQuestion(message.text, language));
  return (questionLikeMessage || messages[messages.length - 1])?.text.trim() || '';
}

/** Defensively normalizes persisted conversation rows from extension storage. */
export function normalizeConversation(value: unknown): ConversationMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((message): message is ConversationMessage => {
    const candidate = message as Partial<ConversationMessage>;
    return (
      (candidate.role === 'candidate' || candidate.role === 'interviewer' || candidate.role === 'assistant')
      && typeof candidate.text === 'string'
      && Number.isFinite(candidate.createdAt)
    );
  });
}

/** Creates a stable key for comparing question text. */
export function normalizeQuestionKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 180);
}

