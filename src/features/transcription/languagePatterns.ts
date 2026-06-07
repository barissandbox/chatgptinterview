/** Language-specific question keyword patterns for transcript question detection. */
import type { AssistantLanguage } from '../../shared/types';

export const TARGETED_QUESTION_PATTERNS = Object.freeze<Partial<Record<AssistantLanguage, RegExp[]>>>({
  tr: [
    /\b(nedir|neydi|neden|niye|nasil|hangi|hangisi|kim|kime|kimi|nerede|nereden|nereye|ne zaman|kac|kacinci)\b/,
    /\b(mi|mı|mu|mü|misin|misiniz|musun|musunuz|miyiz|muyuz|miyim)\b/,
    /\b(kendinizden|kendinden)\s+(kisaca\s+)?bahseder\b/,
    /\b(aciklar misin|aciklar misiniz|anlatir misin|anlatir misiniz|ornek verir misin|ornek verir misiniz)\b/
  ],
  en: [
    /\b(what|why|how|when|where|which|who|whom|whose)\b/,
    /\b(can|could|would|will|do|does|did|are|is|was|were|have|has|had)\s+you\b/,
    /\b(tell me about|walk me through|describe|explain|implement|design|solve)\b/
  ],
  'en-US': [
    /\b(what|why|how|when|where|which|who|whom|whose)\b/,
    /\b(can|could|would|will|do|does|did|are|is|was|were|have|has|had)\s+you\b/,
    /\b(tell me about|walk me through|describe|explain|implement|design|solve)\b/
  ],
  'en-AU': [
    /\b(what|why|how|when|where|which|who|whom|whose)\b/,
    /\b(can|could|would|will|do|does|did|are|is|was|were|have|has|had)\s+you\b/,
    /\b(tell me about|walk me through|describe|explain|implement|design|solve)\b/
  ],
  'en-GB': [
    /\b(what|why|how|when|where|which|who|whom|whose)\b/,
    /\b(can|could|would|will|do|does|did|are|is|was|were|have|has|had)\s+you\b/,
    /\b(tell me about|walk me through|describe|explain|implement|design|solve)\b/
  ],
  'en-IN': [
    /\b(what|why|how|when|where|which|who|whom|whose)\b/,
    /\b(can|could|would|will|do|does|did|are|is|was|were|have|has|had)\s+you\b/,
    /\b(tell me about|walk me through|describe|explain|implement|design|solve)\b/
  ],
  'en-NZ': [
    /\b(what|why|how|when|where|which|who|whom|whose)\b/,
    /\b(can|could|would|will|do|does|did|are|is|was|were|have|has|had)\s+you\b/,
    /\b(tell me about|walk me through|describe|explain|implement|design|solve)\b/
  ],
  ar: [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  'ar-DZ': [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  'ar-TD': [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  'ar-EG': [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  'ar-IR': [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  'ar-IQ': [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  'ar-JO': [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  'ar-KW': [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  'ar-LB': [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  'ar-MA': [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  'ar-PS': [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  'ar-QA': [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  'ar-SA': [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  'ar-SD': [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  'ar-SY': [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  'ar-TN': [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  'ar-AE': [/(?:^|\s)(ماذا|ما|لماذا|كيف|متى|أين|اين|أي|اي|هل|من)(?:\s|$)/],
  zh: [/(什么|甚麼|为什么|為什麼|怎么|怎麼|如何|哪里|哪裡|何时|何時|谁|誰|哪|吗|嗎)/],
  'zh-CN': [/(什么|甚麼|为什么|為什麼|怎么|怎麼|如何|哪里|哪裡|何时|何時|谁|誰|哪|吗|嗎)/],
  'zh-Hans': [/(什么|甚麼|为什么|為什麼|怎么|怎麼|如何|哪里|哪裡|何时|何時|谁|誰|哪|吗|嗎)/],
  'zh-TW': [/(什么|甚麼|为什么|為什麼|怎么|怎麼|如何|哪里|哪裡|何时|何時|谁|誰|哪|吗|嗎)/],
  'zh-Hant': [/(什么|甚麼|为什么|為什麼|怎么|怎麼|如何|哪里|哪裡|何时|何時|谁|誰|哪|吗|嗎)/],
  'zh-HK': [/(什么|甚麼|为什么|為什麼|怎么|怎麼|如何|哪里|哪裡|何时|何時|谁|誰|哪|吗|嗎)/],
  ja: [/(何|なぜ|どう|どこ|いつ|誰|どれ|ですか|ますか|でしょうか|か)$/],
  ko: [/(무엇|뭐|왜|어떻게|어디|언제|누구|어느|인가요|습니까|까요)/],
  'ko-KR': [/(무엇|뭐|왜|어떻게|어디|언제|누구|어느|인가요|습니까|까요)/],
  he: [/(?:^|\s)(מה|למה|איך|איפה|מתי|מי|האם|איזה)(?:\s|$)/],
  hi: [/(क्या|क्यों|कैसे|कहाँ|कब|कौन|कौन सा|कितना|कितनी|किस)/],
  mr: [/(क्या|क्यों|कैसे|कहाँ|कब|कौन|कौन सा|कितना|कितनी|किस)/],
  ur: [/(کیا|کیوں|کیسے|کہاں|کب|کون|کون سا|کتنا|کس)/],
  fa: [/(چیست|چه|چرا|چگونه|کجا|کی|چه زمانی|کدام|آیا|کیست)/],
  bn: [/(কি|কী|কেন|কিভাবে|কীভাবে|কোথায়|কোথায়|কখন|কে|কোন)/],
  ta: [/(என்ன|ஏன்|எப்படி|எங்கே|எப்போது|யார்|எது|எந்த)/],
  te: [/(ఏమి|ఏంటి|ఎందుకు|ఎలా|ఎక్కడ|ఎప్పుడు|ఎవరు|ఏది|ఏ)/],
  kn: [/(ಏನು|ಏಕೆ|ಹೇಗೆ|ಎಲ್ಲಿ|ಯಾವಾಗ|ಯಾರು|ಯಾವ)/],
  th: [/(อะไร|ทำไม|อย่างไร|ยังไง|ที่ไหน|เมื่อไหร่|ใคร|ไหน|หรือไม่|ไหม)/],
  'th-TH': [/(อะไร|ทำไม|อย่างไร|ยังไง|ที่ไหน|เมื่อไหร่|ใคร|ไหน|หรือไม่|ไหม)/]
});

export const GENERAL_QUESTION_PATTERNS = Object.freeze([
  /\b(que|quoi|pourquoi|comment|quand|ou|quel|quelle|quels|quelles|qui|combien|est ce que)\b/,
  /\b(qué|que|por que|por qué|como|cómo|cuando|cuándo|donde|dónde|cual|cuál|quien|quién|cuanto|cuánto)\b/,
  /\b(was|warum|wie|wann|wo|welche|welcher|welches|wer|wieso)\b/,
  /\b(cosa|perche|perché|come|quando|dove|quale|chi|quanto)\b/,
  /\b(wat|waarom|hoe|wanneer|waar|welke|wie|hoeveel)\b/,
  /\b(o que|por que|porque|como|quando|onde|qual|quem|quanto)\b/,
  /\b(co|proč|proc|jak|kdy|kde|který|ktery|kdo|kolik)\b/,
  /\b(co|dlaczego|jak|kiedy|gdzie|który|ktory|kto|ile|czy)\b/,
  /\b(что|почему|как|когда|где|какой|кто|сколько|ли)\b/,
  /\b(що|чому|як|коли|де|який|хто|скільки|чи)\b/,
  /\b(kaj|zakaj|kako|kdaj|kje|kateri|kdo|koliko)\b/,
  /\b(čo|co|prečo|preco|ako|kedy|kde|ktorý|ktory|kto|koľko|kolko)\b/,
  /\b(шта|šta|зашто|zašto|како|kako|када|kada|где|gde|ко|ko|колико|koliko)\b/,
  /\b(какво|защо|как|кога|къде|кой|колко|дали)\b/,
  /\b(ce|de ce|cum|cand|când|unde|care|cine|cat|cât)\b/,
  /\b(mit|miért|miert|hogyan|mikor|hol|melyik|ki|mennyi)\b/,
  /\b(vad|varför|varfor|hur|när|nar|var|vilken|vem|hur mycket)\b/,
  /\b(hvad|hvorfor|hvordan|hvornår|hvornar|hvor|hvilken|hvem|hvor meget)\b/,
  /\b(hva|hvorfor|hvordan|når|nar|hvor|hvilken|hvem|hvor mye)\b/,
  /\b(mitä|mita|miksi|miten|milloin|missä|missa|mikä|mika|kuka|kuinka)\b/,
  /\b(mis|miks|kuidas|millal|kus|milline|kes|kui palju)\b/,
  /\b(kas|kāpēc|kapec|kā|ka|kad|kur|kurš|kurs|kas|cik)\b/,
  /\b(kas|kodėl|kodel|kaip|kada|kur|kuris|kas|kiek)\b/,
  /\b(τι|γιατι|γιατί|πως|πώς|ποτε|πότε|που|πού|ποιος|ποσο|πόσο)\b/,
  /\b(apa|mengapa|kenapa|bagaimana|kapan|di mana|dimana|mana|siapa|berapa|apakah)\b/,
  /\b(ano|bakit|paano|kailan|saan|alin|sino|magkano|ba)\b/,
  /\b(što|sto|zašto|zasto|kako|kada|gdje|koji|tko|koliko)\b/,
  /\b(што|зошто|како|кога|каде|кој|колку|дали)\b/
]);

/** Checks English interview prompt keywords. */
export function hasEnglishQuestionKeyword(text: string): boolean {
  return (TARGETED_QUESTION_PATTERNS.en || []).some((pattern) => pattern.test(text));
}

/** Checks Turkish interview prompt keywords after Turkish-aware normalization. */
export function hasTurkishQuestionKeyword(text: string): boolean {
  return (TARGETED_QUESTION_PATTERNS.tr || []).some((pattern) => pattern.test(text));
}

/** Checks question keywords for the selected Deepgram language. */
export function hasTargetedQuestionKeyword(text: string, language: AssistantLanguage): boolean {
  if (language === 'tr') {
    return hasTurkishQuestionKeyword(text);
  }

  if (language === 'en' || language.startsWith('en-')) {
    return hasEnglishQuestionKeyword(text);
  }

  return (TARGETED_QUESTION_PATTERNS[language] || []).some((pattern) => pattern.test(text));
}

/** Checks broad multilingual question keywords used as a fallback. */
export function hasGeneralQuestionKeyword(text: string): boolean {
  return GENERAL_QUESTION_PATTERNS.some((pattern) => pattern.test(text));
}

/** Checks targeted language keywords first, then broad multilingual fallback patterns. */
export function hasQuestionKeyword(text: string, language: AssistantLanguage): boolean {
  return hasTargetedQuestionKeyword(text, language) || hasGeneralQuestionKeyword(text);
}
