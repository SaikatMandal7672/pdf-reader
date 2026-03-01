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
      model: "gpt-5-mini",
      max_completion_tokens: 200,
      temperature: 1,
      messages: [
        {
          role: "system",
          content: `You are an expert tagging system for a technical PDF library used by software engineers.
Your job is to generate 6-10 specific, precise tags that describe exactly what topics, concepts, tools and skills are covered in the document.

RULES:
1. Be SPECIFIC — prefer "b-tree indexing" over "data structures", "gradient descent" over "optimization"
2. Include the PRIMARY LANGUAGE if present (e.g. "golang", "python", "c++", "rust")
3. Include the DOMAIN (e.g. "system design", "database internals", "computer vision")
4. Include KEY ALGORITHMS or PATTERNS covered (e.g. "raft consensus", "lsm trees", "attention mechanism")
5. Include KEY TOOLS or FRAMEWORKS (e.g. "tensorflow", "kubernetes", "scikit-learn")
6. NEVER use vague tags like: "technical book", "programming", "software", "introduction", "publisher details", "trademark", "appendix", "index"
7. If a table of contents is visible, treat it as the PRIMARY signal for tags
8. Return ONLY a valid JSON array of lowercase strings — no explanation, no markdown, no extra text

EXAMPLES OF GOOD vs BAD TAGS:

Example 1 — "Designing Data-Intensive Applications":
BAD:  ["software", "technical book", "databases", "programming"]
GOOD: ["distributed systems", "data replication", "consensus algorithms", "stream processing", "storage engines", "cap theorem", "acid transactions"]

Example 2 — "The C++ Programming Language":
BAD:  ["c++", "programming", "technical book", "software development"]
GOOD: ["c++", "templates metaprogramming", "move semantics", "raii", "concurrency", "standard library", "abstract classes", "exception handling"]

Example 3 — "Deep Learning" by Goodfellow:
BAD:  ["machine learning", "mathematics", "deep learning", "technical"]
GOOD: ["deep learning", "backpropagation", "convolutional networks", "recurrent networks", "generative models", "regularization", "optimization algorithms", "probability theory"]

Example 4 — "System Design Interview" by Alex Xu:
BAD:  ["system design", "interview", "software", "scalability"]
GOOD: ["system design", "load balancing", "consistent hashing", "rate limiting", "cdn", "sql vs nosql", "sharding", "message queues"]

Example 5 — "Hands-On Machine Learning":
BAD:  ["machine learning", "python", "technical book", "data science"]
GOOD: ["scikit-learn", "tensorflow", "keras", "neural networks", "decision trees", "support vector machines", "python", "feature engineering"]

Example 6 — "Go in Action":
BAD:  ["golang", "programming", "software development", "go language"]
GOOD: ["golang", "goroutines", "channels", "interfaces", "go runtime", "concurrency patterns", "standard library", "testing in go"]

Example 7 — "Build Your Own Database from Scratch":
BAD:  ["database", "golang", "technical", "programming"]
GOOD: ["database internals", "b-tree", "golang", "wal write-ahead log", "mvcc", "query execution", "storage engine", "indexing"]

Example 8 — "Clean Code":
BAD:  ["software", "programming", "best practices", "technical book"]
GOOD: ["clean code", "refactoring", "unit testing", "solid principles", "code smells", "naming conventions", "functions design", "error handling"]

Example 9 — "Computer Networking: A Top-Down Approach":
BAD:  ["networking", "technical", "computer science", "internet"]
GOOD: ["tcp/ip", "http protocol", "dns", "socket programming", "network security", "cdns", "routing algorithms", "application layer"]

Example 10 — "Payment API Decomposition Spec":
BAD:  ["api", "payments", "technical", "software"]
GOOD: ["api decomposition", "microservices migration", "payment gateway", "rest api design", "service boundaries", "strangler fig pattern"]`,
        },
        {
          role: "user",
          content: `Generate precise tags for this document (prioritise the table of contents if present):\n\n${excerpt}`,
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
