import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function generateTags(
  pdfBuffer: Buffer
): Promise<{ tags: string[]; debug?: string }> {
  if (!process.env.GEMINI_API_KEY) {
    return { tags: [], debug: "GEMINI_API_KEY is not set" };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = await import("pdf-parse").then((m) => (m as any).default ?? m);
    const data = await pdfParse(pdfBuffer, { max: 3 });
    const text = data.text.slice(0, 3000).trim();

    if (!text) {
      return { tags: [], debug: "No text extracted from PDF (possibly image-based)" };
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(
      `You are a tagging system for a PDF library of technical books and documents.
Based on the following text extracted from the first few pages of a PDF, generate 3 to 6 short, relevant tags describing the main topics.

Rules:
- Tags must be lowercase
- Max 3 words per tag
- Return ONLY a valid JSON array of strings, nothing else
- Focus on technical topics, concepts, and domains

Text:
${text}

Example output: ["system design", "distributed systems", "databases"]`
    );

    const raw = result.response.text().trim();
    const match = raw.match(/\[[\s\S]*\]/);

    if (!match) {
      return { tags: [], debug: `Gemini response was not a JSON array: ${raw.slice(0, 200)}` };
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
