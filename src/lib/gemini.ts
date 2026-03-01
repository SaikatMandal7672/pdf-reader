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

    // Skip first 500 chars (usually cover/copyright) and take up to 6000 chars
    // to cover the table of contents which gives the best topic signal
    const excerpt = text.slice(500, 6500).trim();

    if (!excerpt) {
      return { tags: [], debug: "No text extracted from PDF (possibly image-based or encrypted)" };
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 150,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You are a tagging system for a technical PDF library. Generate 5-8 specific, meaningful tags that precisely describe what a reader will LEARN from this book.

Rules:
- Use specific technical concepts, algorithms, tools, frameworks, patterns (e.g. "b-tree indexing", "gradient descent", "dependency injection")
- Include the primary programming language if relevant (e.g. "golang", "python", "c++")
- Include the domain (e.g. "system design", "machine learning", "database internals")
- NEVER use generic tags like "technical book", "programming", "software development", "introduction", "publisher details"
- If a table of contents is present, use it as the primary signal
- Return ONLY a valid JSON array of lowercase strings, no explanation, no markdown`,
        },
        {
          role: "user",
          content: `Generate precise tags for this document:\n\n${excerpt}`,
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
