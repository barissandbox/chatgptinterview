/** Shared domain and transport types for the interview assistant extension. */
import type { DeepgramLanguageCode } from './languages';

export type AssistantLanguage = DeepgramLanguageCode;
export type ResponseStyle = 'low' | 'medium' | 'high';
export type ThinkingVariant = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type InputModality = 'text' | 'image';
export type AnswerType = 'keywords' | 'details' | 'sentences' | 'none';

export interface PendingOAuth {
  state: string;
  verifier: string;
  tabId?: number;
  startedAt: number;
}

export interface AuthStorage {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  accountEmail?: string | null;
  chatgptAccountId?: string | null;
  pendingOAuth?: PendingOAuth;
  error?: string | null;
}

export interface AssistantSettings {
  model?: string;
  thinkingVariant?: ThinkingVariant;
  verbosity?: ResponseStyle;
  fastEnabled?: boolean;
  language?: AssistantLanguage;
  answerType?: AnswerType;
  targetPosition?: string;
}

export interface CandidateProfileStorage {
  fileName?: string;
  text?: string;
  updatedAt?: number;
}

export interface ConversationMessage {
  role: 'candidate' | 'interviewer' | 'assistant';
  text: string;
  createdAt: number;
}

export interface AssistantStorage {
  conversation?: ConversationMessage[];
  lastAnswer?: string;
  lastDetectedQuestion?: string;
  lastAutoAnswerAt?: number;
}

export interface DeepgramStorage {
  apiKey?: string;
  balanceLabel?: string;
  balanceUpdatedAt?: number;
}

export interface LimitInfoItem {
  id: string;
  featureLabel: string;
  windowLabel: string;
  leftPercent: number;
  usedPercent: number;
  resetsAt: number;
  windowDurationMins: number;
  limitId: string;
}

export interface LimitInfo {
  planName: string;
  items: LimitInfoItem[];
}

export interface LegacyLimitInfo {
  leftPercent: number;
  usedPercent?: number;
  resetsAt: number;
  windowDurationMins: number;
  label?: string;
  planName?: string;
  plan?: string;
  planType?: string;
  subscriptionPlan?: string;
}

export type StoredLimitInfo = LimitInfo | LegacyLimitInfo | Record<string, unknown> | null;

export interface ThinkingVariantOption {
  value: ThinkingVariant;
  description: string;
}

export interface AvailableModel {
  id: string;
  model: string;
  displayName: string;
  description: string;
  availableInPlans: string[];
  hidden: boolean;
  isDefault: boolean;
  inputModalities: InputModality[];
  defaultThinkingVariant: ThinkingVariant;
  thinkingVariants: ThinkingVariantOption[];
}

export interface CatalogStorage {
  availableModels?: AvailableModel[];
  codexClientVersion?: string;
  limitInfo?: StoredLimitInfo;
  limitInfoUpdatedAt?: number;
}

export interface ExtensionStorage {
  auth?: AuthStorage;
  settings?: AssistantSettings;
  profile?: CandidateProfileStorage;
  assistant?: AssistantStorage;
  deepgram?: DeepgramStorage;
  catalog?: CatalogStorage;
}

export interface AccessContext {
  accessToken: string;
  chatgptAccountId: string | null;
}

export interface TokenResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface OkResult {
  ok: true;
}

export interface ErrorResult {
  ok: false;
  error: string;
}

export type Result<T extends object = Record<never, never>> = (OkResult & T) | ErrorResult;

export interface StatusPayload {
  ok: true;
  auth: {
    loggedIn: boolean;
    accountEmail: string;
    error: string;
    expiresAt: number | null;
  };
  settings: {
    model: string;
    thinkingVariant: ThinkingVariant;
    verbosity: ResponseStyle;
    fastEnabled: boolean;
    language: AssistantLanguage;
    answerType: AnswerType;
    targetPosition: string;
  };
  profile: {
    fileName: string;
    text: string;
    updatedAt: number | null;
  };
  assistant: {
    lastAnswer: string;
    conversation: ConversationMessage[];
  };
  catalog: {
    limitInfo: LimitInfo | null;
    limitInfoUpdatedAt: number | null;
    availableModels: AvailableModel[];
    codexClientVersion: string;
  };
  deepgram: {
    apiKeySaved: boolean;
    balanceLabel: string;
  };
}

export interface QuestionDetectionTranscript {
  speaker: 'candidate' | 'interviewer';
  text: string;
  timestamp: number;
  isProcessed: boolean;
}

export interface AuthStartRequest {
  action: 'auth.start';
}

export interface AuthSignOutRequest {
  action: 'auth.signOut';
}

export interface StatusGetRequest {
  action: 'status.get';
}

export interface CatalogRefreshModelsRequest {
  action: 'catalog.refreshModels';
}

export interface CatalogRefreshLimitsRequest {
  action: 'catalog.refreshLimits';
}

export interface AssistantOpenRequest {
  action: 'assistant.open';
}

export interface AssistantAppendTranscriptRequest {
  action: 'assistant.transcript.append';
  text: string;
  speaker?: 'candidate' | 'interviewer';
}

export interface CaptureTabStartRequest {
  action: 'capture.tab.start';
  language?: AssistantLanguage;
}

export interface CaptureTabStopRequest {
  action: 'capture.tab.stop';
}

export interface CaptureMicStartRequest {
  action: 'capture.mic.start';
  language?: AssistantLanguage;
}

export interface CaptureMicStopRequest {
  action: 'capture.mic.stop';
}

export interface AssistantGenerateRequest {
  action: 'assistant.answer.generate';
  question?: string;
  source?: 'auto' | 'manual';
}

export interface AssistantDetectQuestionRequest {
  action: 'assistant.question.detect';
  transcripts: QuestionDetectionTranscript[];
  language?: AssistantLanguage;
}

export interface AssistantClearRequest {
  action: 'assistant.clear';
}

export type RuntimeRequest =
  | AuthStartRequest
  | AuthSignOutRequest
  | StatusGetRequest
  | CatalogRefreshModelsRequest
  | CatalogRefreshLimitsRequest
  | AssistantOpenRequest
  | AssistantAppendTranscriptRequest
  | CaptureMicStartRequest
  | CaptureMicStopRequest
  | CaptureTabStartRequest
  | CaptureTabStopRequest
  | AssistantGenerateRequest
  | AssistantDetectQuestionRequest
  | AssistantClearRequest;

export interface AuthChangedEvent {
  action: 'event.authChanged';
  error?: string;
}

export interface AssistantUpdatedEvent {
  action: 'event.assistantUpdated';
}

export type RuntimeEventMessage = AuthChangedEvent | AssistantUpdatedEvent;

export interface AssistantShowMessage {
  action: 'assistant.show';
  loggedIn: boolean;
  accountEmail?: string;
  lastAnswer?: string;
  conversation?: ConversationMessage[];
  language?: AssistantLanguage;
  answerType?: AnswerType;
  targetPosition?: string;
}

export interface AssistantHideMessage {
  action: 'assistant.hide';
}

export interface AssistantRenderAnswerMessage {
  action: 'assistant.answer.render';
  answer: string;
  question?: string;
  streaming?: boolean;
}

export interface AssistantRenderStatusMessage {
  action: 'assistant.status.render';
  status: string;
  tone?: 'status' | 'error';
}

export interface AssistantRenderTranscriptMessage {
  action: 'assistant.transcript.render';
  text: string;
  speaker: 'candidate' | 'interviewer';
  isFinal: boolean;
}

export interface CaptureMicStartMessage {
  action: 'capture.mic.start';
  apiKey: string;
  language?: AssistantLanguage;
}

export interface CaptureMicStopMessage {
  action: 'capture.mic.stop';
}

export type TabMessage =
  | AssistantShowMessage
  | AssistantHideMessage
  | AssistantRenderAnswerMessage
  | AssistantRenderStatusMessage
  | AssistantRenderTranscriptMessage
  | CaptureMicStartMessage
  | CaptureMicStopMessage;
