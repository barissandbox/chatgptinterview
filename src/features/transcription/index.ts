export { detectInterviewQuestionFromTranscripts, looksLikeInterviewQuestion, normalizeDetectionTranscripts } from './questionDetector';
export {
  TARGETED_QUESTION_PATTERNS,
  GENERAL_QUESTION_PATTERNS,
  hasEnglishQuestionKeyword,
  hasTurkishQuestionKeyword,
  hasTargetedQuestionKeyword,
  hasGeneralQuestionKeyword,
  hasQuestionKeyword
} from './languagePatterns';
