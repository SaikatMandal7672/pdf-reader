import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MAX_INLINE_SIZE = 15 * 1024 * 1024; // 15MB — Gemini inline data limit

export async function generateTags(
  pdfBuffer: Buffer
): Promise<{ tags: string[]; debug?: string }> {
  if (!process.env.GEMINI_API_KEY) {
    return { tags: [], debug: "GEMINI_API_KEY is not set" };
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Send PDF directly to Gemini — no text extraction needed
    const data = pdfBuffer.length > MAX_INLINE_SIZE
      ? pdfBuffer.subarray(0, MAX_INLINE_SIZE)
      : pdfBuffer;

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "application/pdf",
          data: data.toString("base64"),
        },
      },
      `Generate 3 to 6 short, relevant tags describing the main topics of this document.
Rules:
- Tags must be lowercase
- Max 3 words per tag
- Return ONLY a valid JSON array of strings, nothing else
- Focus on technical topics, concepts, and domains

Example output: ["system design", "distributed systems", "databases"]`,
    ]);

    const raw = result.response.text().trim();
    const match = raw.match(/\[[\s\S]*\]/);

    if (!match) {
      return { tags: [], debug: `Unexpected Gemini response: ${raw.slice(0, 200)}` };
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
