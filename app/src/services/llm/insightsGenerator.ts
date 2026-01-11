import type { Insight } from '../models/types';

export interface GenerateInsightsParams {
  transcriptText: string;
  language: 'auto' | 'auto_en' | 'auto_tr' | 'en' | 'tr';
  noteId: string;
}

export interface GenerateInsightsResult {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  model: string;
  language: 'en' | 'tr';
}

// Turkish-specific characters
const TURKISH_CHARS = new Set(['ğ', 'ü', 'ş', 'ö', 'ç', 'ı', 'İ', 'Ğ', 'Ü', 'Ş', 'Ö', 'Ç']);
const ENGLISH_STOPWORDS = new Set([
  'the', 'and', 'you', 'are', 'is', 'to', 'of', 'in', 'that', 'it', 'i', 'we', 'a', 'an',
  'for', 'with', 'on', 'as', 'be', 'have', 'has', 'had', 'this', 'but', 'not', 'what', 'all',
]);

function detectLanguage(text: string): 'en' | 'tr' {
  const lowerText = text.toLowerCase();
  let turkishScore = 0;
  let englishScore = 0;

  // Count Turkish-specific characters
  for (const char of text) {
    if (TURKISH_CHARS.has(char)) {
      turkishScore += 2;
    }
  }

  // Count English stopwords
  const words = lowerText.split(/\s+/);
  for (const word of words) {
    if (ENGLISH_STOPWORDS.has(word)) {
      englishScore += 1;
    }
  }

  // Prefer Turkish if it has Turkish chars, otherwise prefer English
  if (turkishScore > 0) {
    return 'tr';
  }
  if (englishScore > 2) {
    return 'en';
  }
  // Default to English if unclear
  return 'en';
}

function normalizeLanguage(language: string): 'en' | 'tr' {
  if (language === 'en' || language === 'auto_en') {
    return 'en';
  }
  if (language === 'tr' || language === 'auto_tr') {
    return 'tr';
  }
  // For 'auto' or unknown, we'll infer from text later
  return 'en'; // Default, will be overridden by detectLanguage if needed
}

function extractSummary(text: string, language: 'en' | 'tr'): string {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) {
    return language === 'en' ? 'No summary available.' : 'Özet mevcut değil.';
  }

  // Take first 1-2 sentences, but limit to ~180 chars
  let summary = sentences[0].trim();
  if (summary.length < 180 && sentences.length > 1) {
    summary += '. ' + sentences[1].trim();
  }

  // Truncate to 180 chars if needed
  if (summary.length > 180) {
    summary = summary.substring(0, 177) + '...';
  }

  return summary;
}

function extractKeyPoints(text: string, language: 'en' | 'tr'): string[] {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 20);
  if (sentences.length === 0) {
    return language === 'en' ? ['No key points available.'] : ['Ana nokta mevcut değil.'];
  }

  // Take up to 5 sentences as key points
  const maxPoints = Math.min(5, sentences.length);
  return sentences.slice(0, maxPoints).map((s) => s.trim()).filter((s) => s.length > 0);
}

function extractActionItems(text: string, language: 'en' | 'tr'): string[] {
  const lowerText = text.toLowerCase();
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  const actionVerbs: Record<'en' | 'tr', string[]> = {
    en: ['do', 'make', 'create', 'send', 'call', 'write', 'check', 'review', 'update', 'complete', 'finish', 'start', 'follow'],
    tr: ['yap', 'gönder', 'ara', 'yaz', 'kontrol', 'incele', 'güncelle', 'tamamla', 'bitir', 'başla', 'takip'],
  };

  const verbs = actionVerbs[language];
  const actionItems: string[] = [];

  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    for (const verb of verbs) {
      if (lowerSentence.includes(verb)) {
        // Extract a concise action item (limit to ~60 chars)
        let action = sentence.trim();
        if (action.length > 60) {
          action = action.substring(0, 57) + '...';
        }
        if (action && !actionItems.includes(action)) {
          actionItems.push(action);
        }
        break;
      }
    }
  }

  // If we found action items, return them (up to 3)
  if (actionItems.length > 0) {
    return actionItems.slice(0, 3);
  }

  // Otherwise, return generic action items
  if (language === 'en') {
    return [
      'Review the transcript for important details.',
      'Follow up on any mentioned tasks or deadlines.',
      'Consider sharing insights with relevant team members.',
    ];
  } else {
    return [
      'Transkripti önemli detaylar için gözden geçirin.',
      'Belirtilen görevler veya son tarihleri takip edin.',
      'İlgili ekip üyeleriyle içgörüleri paylaşmayı düşünün.',
    ];
  }
}

export function generateInsights(params: GenerateInsightsParams): GenerateInsightsResult {
  const { transcriptText, language: inputLanguage, noteId } = params;

  console.log('[InsightsGenerator] generateInsights called for noteId:', noteId, 'language:', inputLanguage);

  // Normalize language: convert auto_en/auto_tr/auto to en/tr
  let normalizedLanguage = normalizeLanguage(inputLanguage);

  // If language is 'auto' or unclear, detect from transcript
  if (inputLanguage === 'auto' || normalizedLanguage === 'en') {
    // Re-detect if we're unsure
    const detected = detectLanguage(transcriptText);
    if (detected === 'tr' || (inputLanguage === 'auto' && detected === 'tr')) {
      normalizedLanguage = 'tr';
    }
  }

  console.log('[InsightsGenerator] normalized language:', normalizedLanguage, 'model: local_fake_v1');

  const summary = extractSummary(transcriptText, normalizedLanguage);
  const keyPoints = extractKeyPoints(transcriptText, normalizedLanguage);
  const actionItems = extractActionItems(transcriptText, normalizedLanguage);

  console.log('[InsightsGenerator] Generated insights - summary length:', summary.length, 'keyPoints:', keyPoints.length, 'actionItems:', actionItems.length);

  return {
    summary,
    keyPoints,
    actionItems,
    model: 'local_fake_v1',
    language: normalizedLanguage,
  };
}

