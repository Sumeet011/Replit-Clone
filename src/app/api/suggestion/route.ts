import { generateText } from "ai";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { groq } from "@ai-sdk/groq";
// import { google } from "@ai-sdk/google";
import {
  INVALID_GROQ_API_KEY_MESSAGE,
  isAbortLikeError,
  isInvalidProviderApiKeyError,
} from "@/lib/ai-provider-errors";

const requestSchema = z.object({
  fileName: z.string(),
  code: z.string(),
  currentLine: z.string(),
  previousLines: z.string().optional(),
  textBeforeCursor: z.string(),
  textAfterCursor: z.string(),
  nextLines: z.string().optional(),
  lineNumber: z.number(),
  userId: z.string().optional(),
});

const SUGGESTION_PROMPT = `You are a code suggestion assistant.

<context>
<file_name>{fileName}</file_name>
<previous_lines>
{previousLines}
</previous_lines>
<current_line number="{lineNumber}">{currentLine}</current_line>
<before_cursor>{textBeforeCursor}</before_cursor>
<after_cursor>{textAfterCursor}</after_cursor>
<next_lines>
{nextLines}
</next_lines>
<full_code>
{code}
</full_code>
</context>

<instructions>
Follow these steps IN ORDER:

1. First, look at next_lines. If next_lines contains ANY code, check if it continues from where the cursor is. If it does, return empty string immediately - the code is already written.

2. Check if before_cursor ends with a complete statement (;, }, )). If yes, return empty string.

3. Only if steps 1 and 2 don't apply: suggest what should be typed at the cursor position, using context from full_code.

Your suggestion is inserted immediately after the cursor, so never suggest code that's already in the file.
</instructions>`;

const normalizeSuggestion = (raw: string): string => {
  let normalized = raw.trim();

  // Strip fenced code blocks when model ignores plain-text instructions.
  normalized = normalized
    .replace(/^```(?:[a-zA-Z0-9_-]+)?\s*\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  // Handle accidental JSON response from the model.
  if (normalized.startsWith("{")) {
    try {
      const parsed = JSON.parse(normalized) as { suggestion?: unknown };
      if (typeof parsed.suggestion === "string") {
        normalized = parsed.suggestion.trim();
      }
    } catch {
      // Ignore parse failures and keep best-effort raw text.
    }
  }

  if (normalized === "\"\"" || normalized === "''") {
    return "";
  }

  return normalized;
};

export async function POST(request: Request) {
  try {
    const { userId: authUserId } = await auth();

    const body = await request.json();
    const {
      fileName,
      code,
      currentLine,
      previousLines,
      textBeforeCursor,
      textAfterCursor,
      nextLines,
      lineNumber,
      userId: fallbackUserId,
    } = requestSchema.parse(body);

    // Some local setups can have Clerk client/server session mismatch.
    // Allow a development-only fallback to keep local AI suggestions usable.
    const userId = authUserId ??
      (process.env.NODE_ENV !== "production" ? fallbackUserId : undefined);

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    if (!code) {
      return NextResponse.json(
        { error: "Code is required" },
        { status: 400 }
      );
    }

    const prompt = SUGGESTION_PROMPT
      .replace("{fileName}", fileName)
      .replace("{code}", code)
      .replace("{currentLine}", currentLine)
      .replace("{previousLines}", previousLines || "")
      .replace("{textBeforeCursor}", textBeforeCursor)
      .replace("{textAfterCursor}", textAfterCursor)
      .replace("{nextLines}", nextLines || "")
      .replace("{lineNumber}", lineNumber.toString());

    const { text } = await generateText({
      model: groq("llama-3.3-70b-versatile"),
      prompt: `${prompt}\n\nReturn only the suggestion text. Do not return JSON or markdown code fences.`,
    });

    return NextResponse.json({ suggestion: normalizeSuggestion(text) });
  } catch (error) {
    if (isAbortLikeError(error)) {
      return NextResponse.json({ suggestion: "" });
    }

    console.error("Suggestion error: ", error);

    if (isInvalidProviderApiKeyError(error)) {
      return NextResponse.json(
        { error: INVALID_GROQ_API_KEY_MESSAGE },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 },
    );
  }
}
