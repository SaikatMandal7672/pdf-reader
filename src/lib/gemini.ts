import OpenAI from "openai";
import { extractText } from "unpdf";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateTags(
  pdfBuffer: Buffer
): Promise<{ tags: string[]; debug?: string }> {
  if (!process.env.OPENAI_API_KEY) {
    return { tags: [], debug: "OPENAI_API_KEY is not set" };
  }

  try {
    // Extract text from first 3 pages using unpdf (serverless-safe)
    const { text } = await extractText(new Uint8Array(pdfBuffer), {
      mergePages: true,
    });

    // Keep only first 1500 chars to minimise token usage
    const excerpt = text.slice(0, 1500).trim();

    if (!excerpt) {
      return { tags: [], debug: "No text extracted from PDF (possibly image-based or encrypted)" };
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 80, // tags are short — save tokens
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a tagging system for a technical PDF library. Return ONLY a valid JSON array of 3-6 lowercase tags (max 3 words each). No explanation, no markdown, just the JSON array.",
        },
        {
          role: "user",
          content: `Generate tags for this document excerpt:\n\n${excerpt}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const match = raw.match(/\[[\s\S]*\]/);

    if (!match) {
      return { tags: [], debug: `Unexpected response: ${raw.slice(0, 200)}` };
    }

    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) {
      return { tags: [], debug: "Parsed JSON was not an array" };
    }

    const tags = parsed
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.toLowerCase().trim())
      .slice(0, 8);

    return { tags };
  } catch (err) {
    return { tags: [], debug: err instanceof Error ? err.message : String(err) };
  }
}
