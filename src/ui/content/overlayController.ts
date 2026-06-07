/** Renders the in-page ChatGPTInterview transcript overlay. */
import { sendRuntimeMessage } from '../../shared/messaging';
import { getStorage, setStorage } from '../../shared/storage';
import { renderMarkdown } from '../../shared/markdownRenderer';
import { DEEPGRAM_LANGUAGE_OPTIONS, normalizeDeepgramLanguage } from '../../shared/languages';
import { normalizeAnswerType, normalizeTargetPosition } from '../../shared/settings';
import { createAssistantOverlayStyles } from './overlayStyles';
import type { AnswerType, AssistantLanguage, AssistantShowMessage, ConversationMessage } from '../../shared/types';

const OVERLAY_ID = 'chatgpt-interview-overlay';
const STYLE_ID = 'chatgpt-interview-overlay-styles';
const ANSWER_TYPE_OPTIONS: Array<{ value: AnswerType; label: string }> = [
  { value: 'keywords', label: 'Keywords' },
  { value: 'details', label: 'With Details' },
  { value: 'sentences', label: 'Full Sentences' },
  { value: 'none', label: 'None' }
];

interface AssistantState {
  loggedIn: boolean;
  accountEmail: string;
  conversation: ConversationMessage[];
  language: AssistantLanguage;
  answerType: AnswerType;
  targetPosition: string;
  interimMicTranscript: string;
  interimSpeakerTranscript: string;
  lastQuestion: string;
  lastAnswer: string;
  started: boolean;
  micOn: boolean;
  speakerOn: boolean;
  questionQueue: string[];
  questionQueueKeys: string[];
  selectedQuestionIndex: number;
  answersByQuestion: Record<string, string>;
  pendingAnswerKeysByQuestion: Record<string, string>;
  activeAnswerQuestionKey: string;
  questionDetectionCursor: number;
  pendingQuestionDetection: boolean;
  detectAfterCurrent: boolean;
  lastDetectedQuestionKey: string;
  autoFollowQuestions: boolean;
}

interface TranscriptRenderOptions {
  persist?: boolean;
  detect?: boolean;
}

const state: AssistantState = {
  loggedIn: false,
  accountEmail: '',
  conversation: [],
  language: 'tr',
  answerType: 'details',
  targetPosition: '',
  interimMicTranscript: '',
  interimSpeakerTranscript: '',
  lastQuestion: '',
  lastAnswer: '',
  started: false,
  micOn: false,
  speakerOn: false,
  questionQueue: [],
  questionQueueKeys: [],
  selectedQuestionIndex: -1,
  answersByQuestion: {},
  pendingAnswerKeysByQuestion: {},
  activeAnswerQuestionKey: '',
  questionDetectionCursor: 0,
  pendingQuestionDetection: false,
  detectAfterCurrent: false,
  lastDetectedQuestionKey: '',
  autoFollowQuestions: false
};

/** Shows the assistant shell and hydrates it with persisted status data. */
export function showAssistantOverlay(message: AssistantShowMessage): void {
  state.loggedIn = message.loggedIn;
  state.accountEmail = message.accountEmail || '';
  state.conversation = Array.isArray(message.conversation) ? message.conversation : [];
  state.language = normalizeDeepgramLanguage(message.language);
  state.answerType = normalizeAnswerType(message.answerType);
  state.targetPosition = normalizeTargetPosition(message.targetPosition);
  state.lastAnswer = message.lastAnswer || '';
  state.lastQuestion = findLatestQuestion(state.conversation);
  state.questionDetectionCursor = state.conversation.filter((item) => item.role !== 'assistant').length;

  ensureStyles();
  const overlay = getOrCreateOverlay();
  overlay.classList.add('is-visible');
  syncLanguageSelect();
  syncAnswerTypeSelect();
  syncTargetPositionInput();
  updateAnswerTypeMode();
  renderConversation();
  renderAnswerPanel();
  renderStatus(state.loggedIn ? 'Ready.' : 'Sign in from the extension popup.');
  updateButtons();
}

/** Hides the assistant UI and stops any active local capture session. */
export function hideAssistantOverlay(): void {
  document.getElementById(OVERLAY_ID)?.classList.remove('is-visible');
  stopSession();
}

/** Renders the latest assistant answer for the matching question slot. */
export function renderAssistantAnswer(answer: string, question = '', streaming = false): void {
  const questionKey = normalizeQuestionKey(question || state.lastQuestion);
  const key = questionKey ? state.pendingAnswerKeysByQuestion[questionKey] || questionKey : state.activeAnswerQuestionKey;
  if (key) {
    state.answersByQuestion[key] = answer;
  }

  state.lastAnswer = answer;
  state.lastQuestion = question || state.lastQuestion || getSelectedQuestion() || findLatestQuestion(state.conversation);
  renderAnswerPanel();
  renderStatus(streaming ? 'Streaming answer...' : 'Answer ready.');
}

/** Updates the assistant status line with optional error styling. */
export function renderAssistantStatus(status: string, tone: 'status' | 'error' = 'status'): void {
  renderStatus(status, tone);
}

/** Applies incoming transcript text to the live or finalized transcript view. */
export function renderTranscript(
  text: string,
  speaker: 'candidate' | 'interviewer',
  isFinal: boolean,
  options: TranscriptRenderOptions = {}
): void {
  handleTranscriptText(speaker, text, isFinal, {
    persist: options.persist ?? true,
    detect: options.detect ?? true
  });
}

/** Reuses the existing overlay node or builds the DOM once for the current page. */
function getOrCreateOverlay(): HTMLElement {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    return existing;
  }

  const overlay = document.createElement('section');
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div id="civ-status" class="civ-status">Ready.</div>

    <div class="civ-controls">
      <div class="civ-control-row civ-settings-row">
        <div class="civ-settings-left">
          <input id="civ-target-position" type="text" maxlength="160" placeholder="(Optional) Target Position" title="Target Position" aria-label="Target Position">
          <select id="civ-answer-type" class="civ-answer-type" title="Answer type" aria-label="Answer type">
            ${ANSWER_TYPE_OPTIONS.map((option) => (
              `<option value="${option.value}">${option.label}</option>`
            )).join('')}
          </select>
          <select id="civ-language" title="Language" aria-label="Language">
            ${DEEPGRAM_LANGUAGE_OPTIONS.map((option) => (
              `<option value="${option.value}">${option.label}</option>`
            )).join('')}
          </select>
        </div>
      </div>
      <div class="civ-control-row">
        <div class="civ-control-group">
          <button id="civ-mic" title="Microphone transcript">Mic</button>
          <button id="civ-speaker" title="Capture current tab audio">Speaker</button>
          <button id="civ-answer" title="Generate an answer from the transcript">Answer</button>
          <button id="civ-clear" title="Clear transcript">Clear</button>
        </div>
        <div class="civ-session-actions">
          <button id="civ-start" class="civ-primary">Start</button>
          <button id="civ-stop" hidden>Stop</button>
        </div>
      </div>
    </div>

    <div class="civ-body">
      <div class="civ-panel">
        <div id="civ-transcript" class="civ-transcript"></div>
      </div>
      <div id="civ-divider" class="civ-divider" title="Resize transcript and answer"></div>

      <div class="civ-answer-panel">
        <div id="civ-question-row" class="civ-question-row" hidden>
          <span id="civ-question-count" class="civ-question-count"></span>
          <div class="civ-question-nav">
            <button id="civ-question-prev" class="civ-question-button" title="Previous question">&lt;</button>
            <button id="civ-question-autofollow" class="civ-question-button civ-media-button" title="Auto-follow new questions">▶</button>
            <button id="civ-question-next" class="civ-question-button" title="Next question">&gt;</button>
          </div>
          <div id="civ-question" class="civ-question"></div>
        </div>
        <div id="civ-answer-text" class="civ-answer-text"></div>
      </div>
    </div>
  `;

  document.documentElement.appendChild(overlay);
  bindOverlayEvents(overlay);
  bindPanelResizer(overlay);
  return overlay;
}

/** Binds all static toolbar, language, navigation, and clearing interactions. */
function bindOverlayEvents(overlay: HTMLElement): void {
  overlay.querySelector<HTMLButtonElement>('#civ-start')?.addEventListener('click', () => {
    void startSession();
  });
  overlay.querySelector<HTMLButtonElement>('#civ-stop')?.addEventListener('click', () => stopSession());
  overlay.querySelector<HTMLButtonElement>('#civ-mic')?.addEventListener('click', () => {
    if (state.micOn) {
      stopMic();
    } else {
      void startMic();
    }
  });
  overlay.querySelector<HTMLButtonElement>('#civ-speaker')?.addEventListener('click', () => {
    if (state.speakerOn) {
      void stopSpeaker();
    } else {
      void startSpeaker();
    }
  });
  overlay.querySelector<HTMLButtonElement>('#civ-answer')?.addEventListener('click', () => {
    void generateAnswer();
  });
  overlay.querySelector<HTMLButtonElement>('#civ-question-prev')?.addEventListener('click', () => {
    selectQuestion(state.selectedQuestionIndex - 1);
  });
  overlay.querySelector<HTMLButtonElement>('#civ-question-autofollow')?.addEventListener('click', () => {
    toggleAutoFollowQuestions();
  });
  overlay.querySelector<HTMLButtonElement>('#civ-question-next')?.addEventListener('click', () => {
    selectQuestion(state.selectedQuestionIndex + 1);
  });
  overlay.querySelector<HTMLButtonElement>('#civ-clear')?.addEventListener('click', () => {
    state.conversation = [];
    state.lastQuestion = '';
    state.lastAnswer = '';
    state.interimMicTranscript = '';
    state.interimSpeakerTranscript = '';
    state.questionQueue = [];
    state.questionQueueKeys = [];
    state.selectedQuestionIndex = -1;
    state.answersByQuestion = {};
    state.pendingAnswerKeysByQuestion = {};
    state.activeAnswerQuestionKey = '';
    state.questionDetectionCursor = 0;
    state.pendingQuestionDetection = false;
    state.detectAfterCurrent = false;
    state.lastDetectedQuestionKey = '';
    state.autoFollowQuestions = false;
    renderConversation();
    renderAnswerPanel();
    renderStatus('Transcript cleared.');
    void sendRuntimeMessage({ action: 'assistant.clear' });
  });
  overlay.querySelector<HTMLSelectElement>('#civ-language')?.addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value;
    state.language = normalizeDeepgramLanguage(value);
    void saveSetting({ language: state.language });
    if (state.micOn) {
      stopMic();
      void startMic();
    }
  });
  overlay.querySelector<HTMLSelectElement>('#civ-answer-type')?.addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value;
    state.answerType = normalizeAnswerType(value);
    updateButtons();
    void saveSetting({ answerType: state.answerType });
  });
  overlay.querySelector<HTMLInputElement>('#civ-target-position')?.addEventListener('input', (event) => {
    state.targetPosition = normalizeTargetPosition((event.target as HTMLInputElement).value);
    void saveSetting({ targetPosition: state.targetPosition });
  });
}

/** Enables vertical resizing between transcript and answer panels. */
function bindPanelResizer(overlay: HTMLElement): void {
  const divider = overlay.querySelector<HTMLDivElement>('#civ-divider');
  const body = overlay.querySelector<HTMLDivElement>('.civ-body');
  if (!divider || !body) {
    return;
  }

  let dragging = false;
  const stopDragging = (): void => {
    dragging = false;
    divider.classList.remove('is-dragging');
  };
  const resizeFromPointer = (clientY: number): void => {
    const rect = body.getBoundingClientRect();
    const minTranscriptHeight = 72;
    const minAnswerHeight = 160;
    const nextHeight = Math.min(
      Math.max(clientY - rect.top, minTranscriptHeight),
      Math.max(minTranscriptHeight, rect.height - minAnswerHeight)
    );
    body.style.setProperty('--civ-transcript-height', `${Math.round(nextHeight)}px`);
  };

  divider.addEventListener('pointerdown', (event) => {
    dragging = true;
    divider.classList.add('is-dragging');
    divider.setPointerCapture(event.pointerId);
    resizeFromPointer(event.clientY);
    event.preventDefault();
  });
  divider.addEventListener('pointermove', (event) => {
    if (dragging) {
      resizeFromPointer(event.clientY);
    }
  });
  divider.addEventListener('pointerup', stopDragging);
  divider.addEventListener('pointercancel', stopDragging);
  divider.addEventListener('dblclick', () => {
    body.style.removeProperty('--civ-transcript-height');
  });
}

/** Requests a manual answer from the selected text or recent transcript. */
async function generateAnswer(): Promise<void> {
  if (state.answerType === 'none') {
    return;
  }

  if (!state.loggedIn) {
    renderStatus('Sign in from the extension popup before generating an answer.', 'error');
    return;
  }

  const question = getSelectedAnswerInput();
  if (!question) {
    renderStatus('Select text or wait for transcript text before generating an answer.', 'error');
    return;
  }

  const key = appendAnswerItem(question);
  await requestAnswerForQuestion(question, key, true, 'manual');
}

/** Prefers selected page text, then falls back to recent transcript sentences. */
function getSelectedAnswerInput(): string {
  const selectedText = window.getSelection()?.toString().trim() || '';
  if (selectedText) {
    return selectedText.slice(0, 2000);
  }

  return getLastTranscriptSentences(2);
}

/** Returns a compact tail of transcript text for manual answer generation. */
function getLastTranscriptSentences(count: number): string {
  const transcriptText = state.conversation
    .filter((message) => message.role !== 'assistant')
    .map((message) => message.text.trim())
    .filter(Boolean)
    .join(' ');
  if (!transcriptText) {
    return '';
  }

  const sentences = transcriptText
    .match(/[^.!?\n]+[.!?]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) || [];
  return (sentences.length > 0 ? sentences.slice(-count).join(' ') : transcriptText).slice(0, 2000);
}

/** Adds a question to the local queue and selects it for answer rendering. */
function appendAnswerItem(question: string, key = createAnswerKey(question)): string {
  state.questionQueue.push(question);
  state.questionQueueKeys.push(key);
  state.selectedQuestionIndex = state.questionQueue.length - 1;
  state.activeAnswerQuestionKey = key;
  state.lastQuestion = question;
  state.lastAnswer = '';
  state.answersByQuestion[key] = '';
  renderAnswerPanel();
  return key;
}

/** Sends a question to the background answer generator and tracks streaming ownership. */
async function requestAnswerForQuestion(
  question: string,
  key: string,
  selectWhenStreaming = true,
  source: 'auto' | 'manual' = 'manual'
): Promise<void> {
  state.pendingAnswerKeysByQuestion[normalizeQuestionKey(question)] = key;
  if (selectWhenStreaming) {
    state.activeAnswerQuestionKey = key;
    state.lastQuestion = question;
    state.lastAnswer = state.answersByQuestion[key] || '';
    renderAnswerPanel();
    renderStatus('Generating answer...');
  } else {
    renderStatus('Question queued. Generating answer...');
  }
  const result = await sendRuntimeMessage({ action: 'assistant.answer.generate', question, source });
  if (!result.ok) {
    renderStatus(result.error || 'Could not generate an answer yet.', 'error');
  }
}

/** Starts both microphone and current-tab transcript capture for a session. */
async function startSession(): Promise<void> {
  if (!state.loggedIn) {
    renderStatus('Sign in from the extension popup before starting.', 'error');
    return;
  }

  state.started = true;
  enableAutoFollowQuestions();
  updateButtons();
  renderStatus('Starting microphone and tab audio...');
  await startMic();
  await startSpeaker();
  renderStatus(createSessionStatus());
}

/** Stops all capture channels and restores idle UI state. */
function stopSession(): void {
  state.started = false;
  state.autoFollowQuestions = false;
  stopMic();
  void stopSpeaker();
  renderStatus('Stopped.');
  updateButtons();
}

/** Starts microphone STT through the content script runtime channel. */
async function startMic(): Promise<void> {
  stopMic();

  try {
    const result = await sendRuntimeMessage({ action: 'capture.mic.start', language: state.language });
    if (!result.ok) {
      throw new Error(result.error || 'Could not start microphone transcript.');
    }
    state.micOn = true;
    updateButtons();
    renderStatus(createSessionStatus());
  } catch (error) {
    state.micOn = false;
    updateButtons();
    renderStatus(formatMicrophoneError(error), 'error');
  }
}

/** Stops microphone STT and clears interim candidate transcript text. */
function stopMic(): void {
  state.micOn = false;
  state.interimMicTranscript = '';
  renderConversation();
  updateButtons();
  void sendRuntimeMessage({ action: 'capture.mic.stop' }).catch(() => undefined);
}

/** Converts browser microphone failures into user-facing guidance. */
function formatMicrophoneError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/permission|dismiss|denied|notallowed/i.test(message)) {
    return 'Microphone permission was not granted. Allow microphone access for the extension, or use Speaker only.';
  }
  return message || 'Could not start microphone transcript.';
}

/** Starts current-tab speaker STT through the offscreen document. */
async function startSpeaker(): Promise<void> {
  try {
    const result = await sendRuntimeMessage({ action: 'capture.tab.start', language: state.language });
    if (!result.ok) {
      renderStatus(result.error || 'Could not access current tab audio.', 'error');
      return;
    }
    state.speakerOn = true;
    updateButtons();
    renderStatus(createSessionStatus());
  } catch (error) {
    state.speakerOn = false;
    updateButtons();
    renderStatus(error instanceof Error ? error.message : 'Could not start current tab audio.', 'error');
  }
}

/** Stops current-tab speaker STT and clears interim interviewer text. */
async function stopSpeaker(): Promise<void> {
  state.interimSpeakerTranscript = '';
  renderConversation();
  if (!state.speakerOn) {
    return;
  }

  state.speakerOn = false;
  updateButtons();
  await sendRuntimeMessage({ action: 'capture.tab.stop' }).catch(() => undefined);
}

/** Applies interim or final transcript updates to local and persisted state. */
function handleTranscriptText(
  speaker: 'candidate' | 'interviewer',
  text: string,
  isFinal: boolean,
  options: Required<TranscriptRenderOptions>
): void {
  if (!text.trim()) {
    return;
  }
  if (!isFinal) {
    if (speaker === 'candidate') {
      state.interimMicTranscript = text.trim();
    } else {
      state.interimSpeakerTranscript = text.trim();
    }
    renderConversation();
    return;
  }

  if (speaker === 'candidate') {
    state.interimMicTranscript = '';
  } else {
    state.interimSpeakerTranscript = '';
  }
  appendLocalConversation({
    role: speaker === 'candidate' ? 'candidate' : 'interviewer',
    text: text.trim(),
    createdAt: Date.now()
  });
  if (options.persist) {
    void sendRuntimeMessage({ action: 'assistant.transcript.append', text: text.trim(), speaker });
  }
  if (options.detect && shouldDetectQuestions()) {
    void detectQuestionFromTranscript();
  }
  renderLiveState();
}

/** Tracks whether a deferred render is waiting for the user's selection to end. */
let pendingTranscriptRender = false;
let selectionGuardBound = false;

/** Binds document-level listeners once to flush deferred renders when selection ends. */
function ensureSelectionGuard(): void {
  if (selectionGuardBound) {
    return;
  }
  selectionGuardBound = true;

  const flushIfPending = (): void => {
    if (!pendingTranscriptRender) {
      return;
    }
    if (!hasTranscriptSelection()) {
      pendingTranscriptRender = false;
      renderConversationNow();
    }
  };

  document.addEventListener('mouseup', flushIfPending);
  document.addEventListener('selectionchange', flushIfPending);
}

/** Returns true when the user has an active text selection inside the transcript element. */
function hasTranscriptSelection(): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    return false;
  }

  const transcript = document.getElementById('civ-transcript');
  if (!transcript) {
    return false;
  }

  const range = selection.getRangeAt(0);
  return transcript.contains(range.startContainer) || transcript.contains(range.endContainer);
}

/** Renders finalized transcript plus any live interim transcript text. */
function renderConversation(): void {
  if (hasTranscriptSelection()) {
    pendingTranscriptRender = true;
    ensureSelectionGuard();
    return;
  }

  pendingTranscriptRender = false;
  renderConversationNow();
}

/** Unconditionally rebuilds transcript DOM content and auto-scrolls to bottom. */
function renderConversationNow(): void {
  const transcript = document.getElementById('civ-transcript');
  if (!transcript) {
    return;
  }

  const messages = state.conversation.filter((message) => message.role !== 'assistant');
  const liveMessages = getLiveTranscriptMessages();
  if (messages.length === 0 && liveMessages.length === 0) {
    transcript.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'civ-empty';
    empty.textContent = 'No transcript yet.';
    transcript.appendChild(empty);
    return;
  }

  const nextText = messages
    .slice(-80)
    .concat(liveMessages)
    .map((message) => message.text.trim())
    .filter(Boolean)
    .join(' ');

  if (transcript.textContent !== nextText) {
    transcript.textContent = nextText;
  }

  transcript.scrollTop = transcript.scrollHeight;
}

/** Builds transient transcript messages for the currently streaming recognizers. */
function getLiveTranscriptMessages(): ConversationMessage[] {
  const now = Date.now();
  const messages: ConversationMessage[] = [];
  const micText = state.interimMicTranscript.trim();
  if (micText) {
    messages.push({ role: 'candidate', text: micText, createdAt: now });
  }
  const speakerText = state.interimSpeakerTranscript.trim();
  if (speakerText) {
    messages.push({ role: 'interviewer', text: speakerText, createdAt: now });
  }
  return messages;
}

/** Renders selected question metadata and markdown-formatted answer content. */
function renderAnswerPanel(): void {
  const questionRow = document.getElementById('civ-question-row');
  const question = document.getElementById('civ-question');
  const answer = document.getElementById('civ-answer-text');
  const questionCount = document.getElementById('civ-question-count');
  if (!questionRow || !question || !answer) {
    return;
  }

  const shouldStickToBottom = answer.scrollHeight - answer.scrollTop - answer.clientHeight < 24;
  const selectedQuestion = getSelectedQuestion();
  questionRow.hidden = !selectedQuestion;
  question.textContent = selectedQuestion || '';
  if (questionCount) {
    questionCount.textContent = selectedQuestion
      ? `${state.selectedQuestionIndex + 1}/${state.questionQueue.length}`
      : '';
  }

  const selectedKey = getSelectedQuestionKey();
  const selectedAnswer = selectedKey ? state.answersByQuestion[selectedKey] || '' : '';
  renderMarkdown(answer, selectedAnswer || '');
  question.scrollTop = question.scrollHeight;
  if (shouldStickToBottom) {
    answer.scrollTop = answer.scrollHeight;
  }
  updateQuestionButtons();
}

/** Appends a transcript item locally while bounding overlay memory use. */
function appendLocalConversation(message: ConversationMessage): void {
  state.conversation = state.conversation.concat(message).slice(-80);
  renderConversation();
}

/** Detects newly spoken interviewer questions without reprocessing old transcript rows. */
async function detectQuestionFromTranscript(): Promise<void> {
  if (!state.loggedIn || state.pendingQuestionDetection) {
    state.detectAfterCurrent = true;
    return;
  }

  const messages = state.conversation.filter((message) => message.role !== 'assistant');
  const messageCount = messages.length;
  if (messageCount <= state.questionDetectionCursor) {
    return;
  }

  const startIndex = Math.max(0, messageCount - 20);
  const transcripts = messages.slice(startIndex).map((message, index) => ({
    speaker: message.role === 'candidate' ? 'candidate' as const : 'interviewer' as const,
    text: message.text,
    timestamp: message.createdAt,
    isProcessed: startIndex + index < state.questionDetectionCursor
  }));

  state.pendingQuestionDetection = true;
  try {
    const result = await sendRuntimeMessage({
      action: 'assistant.question.detect',
      transcripts,
      language: state.language
    });
    state.questionDetectionCursor = messageCount;
    if (result.ok && result.isQuestion) {
      const questions = Array.isArray(result.questions) && result.questions.length > 0
        ? result.questions
        : [result.question];
      questions.map((question) => question.trim()).filter(Boolean).forEach(addDetectedQuestion);
    }
  } catch {
    state.questionDetectionCursor = messageCount;
  } finally {
    state.pendingQuestionDetection = false;
    if (state.detectAfterCurrent) {
      state.detectAfterCurrent = false;
      void detectQuestionFromTranscript();
    }
  }
}

/** Queues a detected question and starts background answer generation when appropriate. */
function addDetectedQuestion(question: string): void {
  const key = normalizeQuestionKey(question);
  if (!key || key === state.lastDetectedQuestionKey || state.questionQueueKeys.includes(key)) {
    return;
  }

  state.lastDetectedQuestionKey = key;
  state.questionQueue.push(question);
  state.questionQueueKeys.push(key);
  const shouldSelectQuestion = state.selectedQuestionIndex < 0 || state.autoFollowQuestions;
  if (shouldSelectQuestion) {
    selectQuestion(state.questionQueue.length - 1, false);
  }

  renderAnswerPanel();
  renderStatus(shouldSelectQuestion ? 'Question detected. Generating answer...' : `Question queued (${state.questionQueue.length}).`);
  void requestAnswerForQuestion(question, key, shouldSelectQuestion, 'auto');
}

/** Selects a queued question and optionally generates its missing answer. */
function selectQuestion(index: number, autoGenerate = false): void {
  if (state.questionQueue.length === 0) {
    state.selectedQuestionIndex = -1;
    renderAnswerPanel();
    return;
  }

  const nextIndex = Math.max(0, Math.min(index, state.questionQueue.length - 1));
  state.selectedQuestionIndex = nextIndex;
  const question = getSelectedQuestion();
  const key = getSelectedQuestionKey();
  state.lastQuestion = question;
  state.activeAnswerQuestionKey = key;
  state.lastAnswer = key ? state.answersByQuestion[key] || '' : '';
  renderAnswerPanel();
  if (autoGenerate && question && key && !state.answersByQuestion[key]) {
    void requestAnswerForQuestion(question, key, true, 'manual');
  }
}

/** Toggles automatic selection of newly detected questions. */
function toggleAutoFollowQuestions(): void {
  state.autoFollowQuestions = !state.autoFollowQuestions;
  updateQuestionButtons();
  renderStatus(state.autoFollowQuestions ? 'Auto question follow on.' : 'Manual question selection.');
}

/** Forces new questions to be selected automatically after the session starts. */
function enableAutoFollowQuestions(): void {
  state.autoFollowQuestions = true;
  updateQuestionButtons();
}

/** Returns the currently selected queued question text. */
function getSelectedQuestion(): string {
  return state.selectedQuestionIndex >= 0 ? state.questionQueue[state.selectedQuestionIndex] || '' : '';
}

/** Returns the stable answer key for the currently selected question. */
function getSelectedQuestionKey(): string {
  return state.selectedQuestionIndex >= 0 ? state.questionQueueKeys[state.selectedQuestionIndex] || '' : '';
}

/** Writes the compact status line and toggles error treatment. */
function renderStatus(status: string, tone: 'status' | 'error' = 'status'): void {
  const statusElement = document.getElementById('civ-status');
  if (!statusElement) {
    return;
  }
  statusElement.textContent = status;
  statusElement.classList.toggle('is-error', tone === 'error');
}

/** Synchronizes legacy live-state text when that element is present. */
function renderLiveState(): void {
  const live = document.getElementById('civ-live');
  if (live) {
    live.textContent = state.micOn || state.speakerOn ? 'Listening' : 'Idle';
  }
}

/** Refreshes primary control visibility, disabled state, and active styling. */
function updateButtons(): void {
  const start = document.getElementById('civ-start') as HTMLButtonElement | null;
  const stop = document.getElementById('civ-stop') as HTMLButtonElement | null;
  const mic = document.getElementById('civ-mic') as HTMLButtonElement | null;
  const speaker = document.getElementById('civ-speaker') as HTMLButtonElement | null;
  if (start) {
    start.hidden = state.started;
    start.disabled = !state.loggedIn;
  }
  if (stop) {
    stop.hidden = !state.started;
  }
  if (mic) {
    mic.textContent = 'Mic';
    mic.classList.toggle('is-active', state.micOn);
    mic.disabled = !state.loggedIn;
  }
  if (speaker) {
    speaker.textContent = 'Speaker';
    speaker.classList.toggle('is-active', state.speakerOn);
    speaker.disabled = !state.loggedIn;
  }
  updateAnswerTypeMode();
  updateQuestionButtons();
}

/** Refreshes question navigation button disabled states. */
function updateQuestionButtons(): void {
  const previous = document.getElementById('civ-question-prev') as HTMLButtonElement | null;
  const autoFollow = document.getElementById('civ-question-autofollow') as HTMLButtonElement | null;
  const next = document.getElementById('civ-question-next') as HTMLButtonElement | null;
  const hasQuestions = state.questionQueue.length > 0;
  const atFirst = state.selectedQuestionIndex <= 0;
  const atLast = state.selectedQuestionIndex >= state.questionQueue.length - 1;
  if (previous) {
    previous.disabled = !hasQuestions || atFirst;
  }
  if (autoFollow) {
    autoFollow.textContent = state.autoFollowQuestions ? '⏸' : '▶';
    autoFollow.title = state.autoFollowQuestions
      ? 'Pause auto-follow for new questions'
      : 'Play auto-follow for new questions';
    autoFollow.classList.toggle('is-active', state.autoFollowQuestions);
    autoFollow.disabled = !state.loggedIn;
  }
  if (next) {
    next.disabled = !hasQuestions || atLast;
  }
}

/** Keeps the language dropdown aligned with the current assistant state. */
function syncLanguageSelect(): void {
  const select = document.getElementById('civ-language') as HTMLSelectElement | null;
  if (select) {
    select.value = state.language;
  }
}

/** Keeps the answer type dropdown aligned with the current assistant state. */
function syncAnswerTypeSelect(): void {
  const select = document.getElementById('civ-answer-type') as HTMLSelectElement | null;
  if (select) {
    select.value = state.answerType;
  }
}

/** Keeps the target position input aligned with the current assistant state. */
function syncTargetPositionInput(): void {
  const input = document.getElementById('civ-target-position') as HTMLInputElement | null;
  if (input) {
    input.value = state.targetPosition;
  }
}

/** Toggles answer panel, divider, and answer button visibility based on the current answer type. */
function updateAnswerTypeMode(): void {
  const transcriptOnly = state.answerType === 'none';
  const body = document.querySelector<HTMLElement>(`#${OVERLAY_ID} .civ-body`);
  const divider = document.getElementById('civ-divider');
  const answerPanel = document.querySelector<HTMLElement>(`#${OVERLAY_ID} .civ-answer-panel`);
  const answerButton = document.getElementById('civ-answer') as HTMLButtonElement | null;

  body?.classList.toggle('is-transcript-only', transcriptOnly);
  if (divider) {
    divider.hidden = transcriptOnly;
  }
  if (answerPanel) {
    answerPanel.hidden = transcriptOnly;
  }
  if (answerButton) {
    answerButton.hidden = transcriptOnly;
    answerButton.disabled = transcriptOnly || !state.loggedIn;
  }
}

/** Persists a partial assistant settings update without overwriting unrelated fields. */
async function saveSetting(patch: Record<string, unknown>): Promise<void> {
  const { settings = {} } = await getStorage('settings');
  await setStorage({ settings: { ...settings, ...patch } });
}

/** Returns whether automatic question detection should run for transcript updates. */
function shouldDetectQuestions(): boolean {
  return state.answerType !== 'none';
}

/** Builds a short status sentence for the active capture channels. */
function createSessionStatus(): string {
  const mic = state.micOn ? 'mic on' : 'mic off';
  const speaker = state.speakerOn ? 'tab audio on' : 'tab audio off';
  return `Running: ${mic}, ${speaker}.`;
}

/** Finds the latest question-like transcript message in a conversation snapshot. */
function findLatestQuestion(conversation: ConversationMessage[]): string {
  return [...conversation].reverse().find((message) => (
    message.role !== 'assistant' && looksLikeQuestion(message.text)
  ))?.text || '';
}

/** Performs a lightweight question heuristic for already-normalized conversation text. */
function looksLikeQuestion(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (normalized.length >= 8 && normalized.includes('?')) {
    return true;
  }
  return normalized.length >= 8 && (
    /[?？]\s*$/.test(normalized)
    || /\b(what|why|how|when|where|which|who|explain|describe|tell me|walk me through|can you|could you|would you|implement|design|solve)\b/.test(normalized)
    || /\b(nedir|neydi|neden|niye|nasıl|hangi|kim|ne zaman|açıkla|acikla|anlat|tasarla|çöz|coz|uygula|yazar mısın|yazar misin|mısın|misin|musun|müsün)\b/.test(normalized)
  );
}

/** Creates a deduplication key for question text. */
function normalizeQuestionKey(text: string): string {
  return text.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim().slice(0, 180);
}

/** Creates a unique answer bucket key while preserving the normalized question prefix. */
function createAnswerKey(question: string): string {
  return `${normalizeQuestionKey(question)}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

/** Injects overlay CSS once into the host document or side panel page. */
function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = createAssistantOverlayStyles(OVERLAY_ID);
  document.documentElement.appendChild(style);
}
