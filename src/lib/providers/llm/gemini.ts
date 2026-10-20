import { parseReplyJson, reviewReplyPrompt } from './prompt';
import type { GenerateReplyParams, GenerateReplyResult, ILlmProvider } from './types';

// Gemini Developer API. Only the PAID tier is allowed: on the free tier Google may use prompts
// (customer reviews) for training (DESIGN_NOTES §7), so construction requires an explicit opt-in.
export class GeminiLlmProvider implements ILlmProvider {
  constructor(private apiKey: string, private model: string) {}

  async generateReviewReply(params: GenerateReplyParams): Promise<GenerateReplyResult> {
    const { system, user } = reviewReplyPrompt(params);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 400,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            required: ['reply', 'sentiment'],
            properties: { reply: { type: 'STRING' }, sentiment: { type: 'STRING', enum: ['positive', 'neutral', 'negative'] } },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini request failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const { reply, sentiment } = parseReplyJson(text, params.starRating);
    return {
      replyText: reply,
      sentiment,
      modelUsed: this.model,
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}
