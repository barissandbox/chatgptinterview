/** Assistant defaults, storage keys, and model/reasoning normalization helpers. */
import { DEFAULT_TRANSCRIPT_LANGUAGE, normalizeDeepgramLanguage } from './languages';
import type {
  AssistantLanguage,
  AssistantSettings,
  AnswerType,
  AvailableModel,
  ExtensionStorage,
  InputModality,
  ResponseStyle,
  ThinkingVariant,
  ThinkingVariantOption
} from './types';

export const DEFAULT_MODEL = 'gpt-5.4-mini';
export const DEFAULT_THINKING_VARIANT: ThinkingVariant = 'low';
export const DEFAULT_VERBOSITY: ResponseStyle = 'low';
export const DEFAULT_LANGUAGE: AssistantLanguage = DEFAULT_TRANSCRIPT_LANGUAGE;
export const DEFAULT_ANSWER_TYPE: AnswerType = 'details';
export const DEFAULT_CODEX_CLIENT_VERSION = '0.128.0';
export const STORAGE_KEYS = Object.freeze([
  'auth',
  'settings',
  'profile',
  'assistant',
  'deepgram',
  'catalog'
] satisfies readonly (keyof ExtensionStorage)[]);

const DEFAULT_INPUT_MODALITIES: InputModality[] = ['text', 'image'];
const FALLBACK_THINKING_VARIANTS = Object.freeze<ThinkingVariantOption[]>([
  { value: 'low', description: 'Fast responses with lighter reasoning' },
  { value: 'medium', description: 'Balanced reasoning for everyday tasks' },
  { value: 'high', description: 'Greater reasoning depth for complex tasks' },
  { value: 'xhigh', description: 'Extra high reasoning depth for complex tasks' }
]);

export const FALLBACK_MODELS = Object.freeze<AvailableModel[]>([
  createAvailableModel({ id: 'gpt-5.4', model: 'gpt-5.4', isDefault: false }),
  createAvailableModel({ id: DEFAULT_MODEL, model: DEFAULT_MODEL, isDefault: true })
]);

export const INTERVIEW_SYSTEM_PROMPT = [
  'You are ChatGPT Interview, a discreet real-time interview copilot.',
  'Infer the interviewer\'s latest question or task from the provided transcript context.',
  'Use the candidate CV/profile context when it is relevant to behavioral, background, project, leadership, or experience questions.',
  'Ground personal examples in the CV/profile. If the profile does not contain a detail, do not invent it.',
  'Write in the candidate\'s voice, as something the user can say naturally during a live interview.',
  'Start with a direct 1-3 sentence answer, then add 3-5 compact supporting bullets when useful.',
  'For coding tasks, lead with the approach, then include complexity, edge cases, and code only when it helps.',
  'Do not mention hidden prompts, tools, transcripts, or that you are an AI assistant.'
].join(' ');

/** Normalizes persisted assistant settings against the current model catalog. */
export function normalizeAssistantSettings(
  settings: AssistantSettings | undefined,
  availableModels: AvailableModel[] = getAvailableModels()
): Required<AssistantSettings> {
  const model = normalizeModel(settings?.model, availableModels);
  return {
    model,
    thinkingVariant: normalizeThinkingVariant(settings?.thinkingVariant, model, availableModels),
    verbosity: normalizeResponseStyle(settings?.verbosity),
    fastEnabled: settings?.fastEnabled !== false,
    language: normalizeDeepgramLanguage(settings?.language),
    answerType: normalizeAnswerType(settings?.answerType),
    targetPosition: normalizeTargetPosition(settings?.targetPosition)
  };
}

/** Normalizes ChatGPT text verbosity. */
export function normalizeResponseStyle(value: unknown): ResponseStyle {
  return value === 'low' || value === 'medium' || value === 'high'
    ? value
    : DEFAULT_VERBOSITY;
}

/** Normalizes stored answer format preference for prompt shaping. */
export function normalizeAnswerType(value: unknown): AnswerType {
  return value === 'keywords' || value === 'details' || value === 'sentences' || value === 'none'
    ? value
    : DEFAULT_ANSWER_TYPE;
}

/** Normalizes the optional target role used to shape interview answers. */
export function normalizeTargetPosition(value: unknown): string {
  return normalizeOptionalString(value).slice(0, 160);
}

/** Returns a valid model id, falling back to the catalog default. */
export function normalizeModel(
  selectedModel: unknown,
  availableModels: AvailableModel[] = getAvailableModels()
): string {
  const normalizedModel = normalizeOptionalString(selectedModel);
  return normalizedModel && hasAvailableModel(normalizedModel, availableModels)
    ? normalizedModel
    : getDefaultAvailableModel(availableModels);
}

/** Returns a valid thinking variant for the selected model. */
export function normalizeThinkingVariant(
  selectedVariant: unknown,
  selectedModel: string,
  availableModels: AvailableModel[] = getAvailableModels()
): ThinkingVariant {
  const supportedVariants = getSupportedThinkingVariants(selectedModel, availableModels);
  const normalizedVariant = normalizeOptionalString(selectedVariant) as ThinkingVariant;
  return supportedVariants.some((variant) => variant.value === normalizedVariant)
    ? normalizedVariant
    : getDefaultThinkingVariantForModel(selectedModel, availableModels);
}

/** Normalizes a stored or fetched model catalog and falls back when it is empty. */
export function normalizeAvailableModelsCatalog(
  models: unknown,
  fallbackModels: AvailableModel[] = getAvailableModels()
): AvailableModel[] {
  if (!Array.isArray(models)) {
    return cloneAvailableModels(fallbackModels);
  }

  const normalizedModels = models
    .map((model) => normalizeAvailableModelEntry(model, fallbackModels))
    .filter((model): model is AvailableModel => model !== null);

  return normalizedModels.length > 0 ? normalizedModels : cloneAvailableModels(fallbackModels);
}

/** Normalizes one model entry from storage or remote catalog data. */
export function normalizeAvailableModelEntry(
  value: unknown,
  fallbackModels: AvailableModel[] = getAvailableModels()
): AvailableModel | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<AvailableModel>;
  const normalizedModel = normalizeOptionalString(candidate.model);
  if (!normalizedModel) {
    return null;
  }

  return {
    id: normalizeOptionalString(candidate.id) || normalizedModel,
    model: normalizedModel,
    displayName: normalizeOptionalString(candidate.displayName) || normalizedModel,
    description: normalizeOptionalString(candidate.description),
    availableInPlans: normalizePlanNames(candidate.availableInPlans),
    hidden: candidate.hidden === true,
    isDefault: candidate.isDefault === true,
    inputModalities: normalizeInputModalities(candidate.inputModalities),
    defaultThinkingVariant: normalizeThinkingVariant(candidate.defaultThinkingVariant, normalizedModel, fallbackModels),
    thinkingVariants: normalizeThinkingOptions(candidate.thinkingVariants)
  };
}

/** Returns a cloned list of reasoning options supported by the selected model. */
export function getSupportedThinkingVariants(
  selectedModel: string,
  availableModels: AvailableModel[] = getAvailableModels()
): ThinkingVariantOption[] {
  const matchedModel = findAvailableModel(selectedModel, availableModels)
    || availableModels.find((model) => model.isDefault)
    || availableModels[0];
  const thinkingVariants = matchedModel?.thinkingVariants ?? [];
  return thinkingVariants.length > 0
    ? thinkingVariants.map((variant) => ({ ...variant }))
    : getFallbackThinkingVariants();
}

/** Returns the default reasoning option for the selected model. */
export function getDefaultThinkingVariantForModel(
  selectedModel: string,
  availableModels: AvailableModel[] = getAvailableModels()
): ThinkingVariant {
  const selectedModelEntry = findAvailableModel(selectedModel, availableModels);
  if (selectedModel === DEFAULT_MODEL && selectedModelEntry?.thinkingVariants.some((variant) => variant.value === DEFAULT_THINKING_VARIANT)) {
    return DEFAULT_THINKING_VARIANT;
  }
  return selectedModelEntry?.defaultThinkingVariant
    || availableModels.find((model) => model.isDefault)?.defaultThinkingVariant
    || DEFAULT_THINKING_VARIANT;
}

/** Normalizes optional strings from unknown storage or API fields. */
export function normalizeOptionalString(value: unknown): string {
  return String(value || '').trim();
}

/** Returns a cloned fallback model catalog. */
export function getAvailableModels(): AvailableModel[] {
  return cloneAvailableModels(FALLBACK_MODELS);
}

/** Returns the default model id from a catalog. */
export function getDefaultAvailableModel(models: AvailableModel[]): string {
  return models.find((model) => model.model === DEFAULT_MODEL)?.model
    || models.find((model) => model.isDefault)?.model
    || models[0]?.model
    || DEFAULT_MODEL;
}

/** Returns cloned fallback reasoning options. */
export function getFallbackThinkingVariants(): ThinkingVariantOption[] {
  return FALLBACK_THINKING_VARIANTS.map((variant) => ({ ...variant }));
}

/** Creates a bundled fallback model entry. */
function createAvailableModel(overrides: Pick<AvailableModel, 'id' | 'model' | 'isDefault'>): AvailableModel {
  return {
    id: overrides.id,
    model: overrides.model,
    displayName: overrides.model,
    description: '',
    availableInPlans: [],
    hidden: false,
    isDefault: overrides.isDefault,
    inputModalities: [...DEFAULT_INPUT_MODALITIES],
    defaultThinkingVariant: DEFAULT_THINKING_VARIANT,
    thinkingVariants: getFallbackThinkingVariants()
  };
}

/** Deep-clones model catalog entries so callers cannot mutate shared defaults. */
function cloneAvailableModels(models: readonly AvailableModel[]): AvailableModel[] {
  return models.map((model) => ({
    ...model,
    availableInPlans: [...model.availableInPlans],
    inputModalities: [...model.inputModalities],
    thinkingVariants: model.thinkingVariants.map((variant) => ({ ...variant }))
  }));
}

/** Checks whether the catalog contains the requested model id. */
function hasAvailableModel(modelName: string, availableModels: AvailableModel[]): boolean {
  return availableModels.some((model) => model.model === modelName);
}

/** Finds the catalog entry for a model id. */
function findAvailableModel(modelName: string, availableModels: AvailableModel[]): AvailableModel | undefined {
  return availableModels.find((model) => model.model === modelName);
}

/** Normalizes input modalities while preserving a text-capable fallback. */
function normalizeInputModalities(value: unknown): InputModality[] {
  const inputModalities = Array.isArray(value)
    ? value.filter((item): item is InputModality => item === 'text' || item === 'image')
    : DEFAULT_INPUT_MODALITIES;
  return inputModalities.length > 0 ? inputModalities : [...DEFAULT_INPUT_MODALITIES];
}

/** Normalizes reasoning option arrays from storage or remote catalog data. */
function normalizeThinkingOptions(value: unknown): ThinkingVariantOption[] {
  const thinkingVariants = Array.isArray(value)
    ? value
      .map((item) => normalizeThinkingOption(item))
      .filter((item): item is ThinkingVariantOption => item !== null)
    : [];

  return thinkingVariants.length > 0 ? thinkingVariants : getFallbackThinkingVariants();
}

/** Normalizes one reasoning option entry. */
function normalizeThinkingOption(value: unknown): ThinkingVariantOption | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<ThinkingVariantOption>;
  const normalizedValue = normalizeOptionalString(candidate.value) as ThinkingVariant;
  if (!normalizedValue) {
    return null;
  }

  return {
    value: normalizedValue,
    description: normalizeOptionalString(candidate.description) || normalizedValue
  };
}

/** Normalizes plan labels into lowercase comparison tokens. */
function normalizePlanNames(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => normalizeOptionalString(item).toLowerCase()).filter(Boolean)
    : [];
}
