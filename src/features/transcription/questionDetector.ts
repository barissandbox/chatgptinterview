/** Pure transcript normalization and interview-question heuristics. */
import { normalizeDeepgramLanguage } from '../../shared/languages';
import { hasQuestionKeyword } from './languagePatterns';
import type { AssistantLanguage, QuestionDetectionTranscript } from '../../shared/types';

/** Detects the most recent likely interviewer question from a transcript window. */
export function detectInterviewQuestionFromTranscripts(
  value: unknown,
  language?: AssistantLanguage
): { isQuestion: boolean; question: string; questions: string[] } {
  const transcripts = normalizeDetectionTranscripts(value).slice(-20);
  if (transcripts.length === 0 || !transcripts.some((transcript) => !transcript.isProcessed)) {
    return { isQuestion: false, question: '', questions: [] };
  }

  const newMessages = transcripts.filter((transcript) => !transcript.isProcessed);
  const interviewerMessages = newMessages.filter((transcript) => transcript.speaker === 'interviewer');
  if (interviewerMessages.length === 0) {
    return { isQuestion: false, question: '', questions: [] };
  }

  const recentInterviewerMessages = transcripts.filter((transcript) => transcript.speaker === 'interviewer').slice(-6);
  const newInterviewerText = interviewerMessages.map((transcript) => transcript.text.trim()).join(' ');
  const contextCandidates = /[?\uFF1F]/.test(newInterviewerText)
    ? [
      getLastQuestionSentence(recentInterviewerMessages.map((transcript) => transcript.text).join(' ')),
      getLastQuestionSentence(transcripts.slice(-8).map((transcript) => transcript.text).join(' '))
    ]
    : [];
  const candidates = [
    newInterviewerText,
    ...interviewerMessages.map((transcript) => transcript.text.trim()),
    interviewerMessages.slice(-2).map((transcript) => transcript.text.trim()).join(' '),
    ...contextCandidates
  ].map(normalizeDetectedQuestionCandidate).filter(Boolean);

  const normalizedLanguage = normalizeDeepgramLanguage(language);
  const questions = getUniqueQuestions(candidates, normalizedLanguage);
  if (questions.length === 0) {
    return { isQuestion: false, question: '', questions: [] };
  }

  return { isQuestion: true, question: questions[questions.length - 1] || '', questions };
}

/** Validates and bounds unknown transcript rows received from UI messages. */
export function normalizeDetectionTranscripts(value: unknown): QuestionDetectionTranscript[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item): QuestionDetectionTranscript | null => {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const candidate = item as Partial<QuestionDetectionTranscript>;
    const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
    const timestamp = typeof candidate.timestamp === 'number' && Number.isFinite(candidate.timestamp)
      ? candidate.timestamp
      : Date.now();
    if (!text || (candidate.speaker !== 'candidate' && candidate.speaker !== 'interviewer')) {
      return null;
    }

    return {
      speaker: candidate.speaker,
      text: text.slice(0, 1000),
      timestamp,
      isProcessed: candidate.isProcessed === true
    };
  }).filter((item): item is QuestionDetectionTranscript => item !== null);
}

/** Returns whether a normalized transcript fragment resembles an interview question. */
export function looksLikeInterviewQuestion(text: string, language?: AssistantLanguage): boolean {
  const normalizedLanguage = normalizeDeepgramLanguage(language);
  const normalized = normalizeQuestionText(text, normalizedLanguage);
  if (normalized.length < 8 || normalized.length > 420) {
    return false;
  }

  if (/[?\uFF1F]/.test(normalized)) {
    return true;
  }

  return hasQuestionKeyword(normalized, normalizedLanguage);
}

/** Returns the last full question-like sentence without splitting on comma clauses. */
function getLastQuestionSentence(text: string): string {
  const normalizedText = normalizeDetectedQuestionCandidate(text);
  if (!normalizedText) {
    return '';
  }

  const questionSentences = getQuestionSentences(normalizedText);
  if (questionSentences.length > 0) {
    return questionSentences[questionSentences.length - 1] || '';
  }

  const sentenceParts = normalizedText
    .split(/[.!?\uFF1F]+/)
    .map((part) => normalizeDetectedQuestionCandidate(part))
    .filter(Boolean);
  return sentenceParts[sentenceParts.length - 1] || normalizedText;
}

/** Extracts all question-mark-delimited questions from transcript candidates. */
function getQuestionSentences(text: string): string[] {
  const normalizedText = normalizeDetectedQuestionCandidate(text);
  if (!normalizedText) {
    return [];
  }

  const questionMatches = Array.from(normalizedText.matchAll(/([^.!?\uFF1F]*[?\uFF1F])/g));
  return questionMatches
    .map((match) => normalizeDetectedQuestionCandidate(match[1] || ''))
    .filter(Boolean);
}

/** Keeps each valid question once while preserving detection order. */
function getUniqueQuestions(candidates: string[], language: AssistantLanguage): string[] {
  const questions: string[] = [];
  for (const candidate of candidates) {
    const detectedQuestions = getQuestionSentences(candidate);
    const candidateQuestions = detectedQuestions.length > 0 ? detectedQuestions : [candidate];
    for (const question of candidateQuestions) {
      if (!looksLikeInterviewQuestion(question, language)) {
        continue;
      }

      const existingIndex = questions.findIndex((existingQuestion) => areEquivalentQuestions(existingQuestion, question, language));
      if (existingIndex < 0) {
        questions.push(question.slice(0, 1000));
        continue;
      }

      const existingQuestion = questions[existingIndex] || '';
      if (question.length > existingQuestion.length) {
        questions[existingIndex] = question.slice(0, 1000);
      }
    }
  }

  return questions;
}

/** Treats a short split fragment as the same question when a fuller context sentence contains it. */
function areEquivalentQuestions(left: string, right: string, language: AssistantLanguage): boolean {
  const normalizedLeft = normalizeQuestionKeyForComparison(left, language);
  const normalizedRight = normalizeQuestionKeyForComparison(right, language);
  return normalizedLeft === normalizedRight
    || (normalizedLeft.length >= 8 && normalizedRight.includes(normalizedLeft))
    || (normalizedRight.length >= 8 && normalizedLeft.includes(normalizedRight));
}

/** Builds a punctuation-light key for duplicate and split-fragment comparison. */
function normalizeQuestionKeyForComparison(text: string, language: AssistantLanguage): string {
  return normalizeQuestionText(text, language)
    .replace(/[?!.:;,]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalizes detected question text while preserving comma-separated subquestions. */
function normalizeDetectedQuestionCandidate(text: string): string {
  return text
    .replace(/\s+([,.;:?!\uFF1F])/g, '$1')
    .replace(/([,.;:?!\uFF1F])(?=\S)/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalizes casing for all languages and Turkish diacritics only for Turkish matching. */
function normalizeQuestionText(text: string, language: AssistantLanguage): string {
  const normalizedText = language === 'tr'
    ? text.trim().toLocaleLowerCase('tr-TR')
    : text.trim().toLowerCase();

  if (language !== 'tr') {
    return normalizedText;
  }

  return normalizedText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .replace(/\u011F/g, 'g')
    .replace(/\u00FC/g, 'u')
    .replace(/\u015F/g, 's')
    .replace(/\u00F6/g, 'o')
    .replace(/\u00E7/g, 'c');
}
