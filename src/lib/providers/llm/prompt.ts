import type { GenerateReplyParams, GenerateReplyResult } from './types';

export const MAX_REPLY_CHARS = 1000; // Google allows ~4096 bytes; short replies read better

export function reviewReplyPrompt(p: GenerateReplyParams): { system: string; user: string } {
  const system = [
    `You write public replies to Google reviews on behalf of ${p.businessName}, a local business.`,
    `Tone: ${p.tone?.trim() || 'warm, professional, and appreciative'}.`,
    p.customInstructions?.trim() ? `Owner instructions: ${p.customInstructions.trim()}` : '',
    'Rules:',
    '- Reply in the same language as the review. 2-4 sentences, under 600 characters.',
    "- Address the reviewer by first name only. Never mention other personal details, appointment specifics, or anything private.",
    '- For negative reviews: thank them, acknowledge the concern without admitting fault or liability, and invite them to contact the business directly to make it right.',
    '- Never offer discounts, refunds, gifts, or incentives (Google policy), and never ask for a review change.',
    "- Don't invent facts, staff names, phone numbers, or emails unless the owner instructions provide them.",
    '- No hashtags, emojis, or quotation marks around the reply.',
    'Return JSON: {"reply": string, "sentiment": "positive" | "neutral" | "negative"}.',
  ]
    .filter(Boolean)
    .join('\n');
  const user = [
    `Reviewer: ${p.reviewerName || 'Anonymous'}`,
    `Stars: ${p.starRating} of 5`,
    `Review text: ${p.reviewComment?.trim() ? p.reviewComment.trim() : '(no text, rating only)'}`,
  ].join('\n');
  return { system, user };
}

export function sentimentFromStars(stars: number): GenerateReplyResult['sentiment'] {
  return stars >= 4 ? 'positive' : stars === 3 ? 'neutral' : 'negative';
}

// Defensive parsing: models occasionally wrap JSON or return odd sentiment values.
export function parseReplyJson(raw: string, stars: number): { reply: string; sentiment: GenerateReplyResult['sentiment'] } {
  let parsed: { reply?: unknown; sentiment?: unknown } = {};
  try {
    parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch {
    throw new Error('Model did not return valid JSON');
  }
  const reply = typeof parsed.reply === 'string' ? parsed.reply.trim().replace(/^["“]|["”]$/g, '').trim() : '';
  if (!reply) throw new Error('Model returned an empty reply');
  const sentiment = parsed.sentiment === 'positive' || parsed.sentiment === 'neutral' || parsed.sentiment === 'negative' ? parsed.sentiment : sentimentFromStars(stars);
  return { reply: reply.slice(0, MAX_REPLY_CHARS), sentiment };
}
