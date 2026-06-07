/** Builds interview prompts and calls ChatGPT for answer generation. */
import { INTERVIEW_SYSTEM_PROMPT } from '../../shared/settings';
import { getDeepgramLanguageLabel } from '../../shared/languages';
import { getStorage } from '../../shared/storage';
import { callChatGpt } from '../../api/chatgpt';
import { publishAssistantAnswer } from './uiPublisher';
import type { AnswerType, AssistantLanguage, ResponseStyle, ThinkingVariant } from '../../shared/types';

const MAX_PROFILE_PROMPT_CHARS = 12_000;
const ANSWER_TYPE_INSTRUCTIONS = Object.freeze<Record<AnswerType, string>>({
  keywords: 'Answer as quick keywords or very short bullet points only. Make it easy to glance at during conversation.',
  details: 'Answer with bullet points that include concise context and explanations. Keep each bullet practical and interview-ready.',
  sentences: 'Answer in natural full sentences that the interviewee can read aloud word-for-word.',
  none: ''
});

/** Builds the interview prompt from user input, settings, and optional CV context. */
export async function requestInterviewAnswer(
  question: string,
  tabId: number | null,
  model: string,
  reasoningEffort: ThinkingVariant,
  verbosity: ResponseStyle,
  fastEnabled: boolean,
  language: AssistantLanguage,
  answerType: AnswerType,
  targetPosition: string
): Promise<string> {
  const profileContext = await getCandidateProfileContext();
  const prompt = [
    profileContext,
    getTargetPositionContext(targetPosition),
    `Question or task:\n${question}`,
    getLanguageInstruction(language),
    'Return the answer in a form the interviewee can say naturally. Keep it concise unless code or steps are required.',
    'For experience questions, adapt the answer to the candidate profile without claiming facts that are not supported there.'
  ].filter(Boolean).join('\n\n');

  return callChatGpt({
    prompt,
    model,
    reasoningEffort,
    instructions: [INTERVIEW_SYSTEM_PROMPT, getAnswerTypeInstruction(answerType)].filter(Boolean).join(' '),
    responseStyle: verbosity,
    fastEnabled,
    onTextUpdate: (partialAnswer) => {
      void publishAssistantAnswer(tabId, partialAnswer, question, { streaming: true });
    }
  });
}

/** Returns optional target role context, matching MeetAssist's position-oriented answer shaping. */
function getTargetPositionContext(targetPosition: string): string {
  const normalizedPosition = targetPosition.trim();
  return normalizedPosition ? `Target position:\n${normalizedPosition}` : '';
}

/** Returns MeetAssist-style answer shape instructions for the selected answer type. */
function getAnswerTypeInstruction(answerType: AnswerType): string {
  return ANSWER_TYPE_INSTRUCTIONS[answerType];
}

/** Reads the locally stored CV/profile text and constrains it for prompt use. */
async function getCandidateProfileContext(): Promise<string> {
  const { profile } = await getStorage('profile');
  const profileText = typeof profile?.text === 'string'
    ? profile.text.trim().slice(0, MAX_PROFILE_PROMPT_CHARS)
    : '';
  if (!profileText) {
    return '';
  }

  const fileName = typeof profile?.fileName === 'string' && profile.fileName.trim()
    ? ` (${profile.fileName.trim()})`
    : '';
  return [
    `Candidate CV/profile context${fileName}:`,
    profileText
  ].join('\n');
}

/** Returns the natural-language answer instruction for the selected transcript language. */
function getLanguageInstruction(language: AssistantLanguage): string {
  if (language === 'multi') {
    return 'Respond in the same language as the interviewer unless they explicitly ask for another language.';
  }

  return `Respond in ${getDeepgramLanguageLabel(language)} unless the interviewer explicitly asks for another language.`;
}
