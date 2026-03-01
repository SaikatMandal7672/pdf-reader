import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function generateTags(pdfBuffer: Buffer): Promise<string[]> {
  try {
    // Extract text from PDF using pdf-parse
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = await import("pdf-parse").then((m) => (m as any).default ?? m);
    const data = await pdfParse(pdfBuffer, { max: 3 }); // first 3 pages only
    const text = data.text.slice(0, 3000).trim();

    if (!text) return [];

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

    // Extract JSON array from response
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const tags: unknown = JSON.parse(match[0]);
    if (!Array.isArray(tags)) return [];

    return tags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.toLowerCase().trim())
      .slice(0, 8);
  } catch {
    return [];
  }
}
