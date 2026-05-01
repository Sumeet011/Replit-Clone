import { z } from "zod";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { groq } from "@ai-sdk/groq";
import {
  INVALID_GROQ_API_KEY_MESSAGE,
  isAbortLikeError,
  isInvalidProviderApiKeyError,
} from "@/lib/ai-provider-errors";

import { firecrawl } from "@/lib/firecrawl";

const requestSchema = z.object({
  selectedCode: z.string(),
  fullCode: z.string().optional(),
  instruction: z.string(),
  userId: z.string().optional(),
});

const URL_REGEX = /https?:\/\/[^\s)>\]]+/g;

const QUICK_EDIT_PROMPT = `You are a code editing assistant. Edit the selected code based on the user's instruction.

<context>
<selected_code>
{selectedCode}
</selected_code>
<full_code_context>
{fullCode}
</full_code_context>
</context>

{documentation}

<instruction>
{instruction}
</instruction>

<instructions>
Return ONLY the edited version of the selected code.
Maintain the same indentation level as the original.
Do not include any explanations or comments unless requested.
If the instruction is unclear or cannot be applied, return the original code unchanged.
</instructions>`;

const normalizeEditedCode = (raw: string): string => {
  let normalized = raw.trim();

  // Strip fenced code blocks when model returns markdown formatting.
  normalized = normalized
    .replace(/^```(?:[a-zA-Z0-9_-]+)?\s*\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  // Handle accidental JSON payloads.
  if (normalized.startsWith("{")) {
    try {
      const parsed = JSON.parse(normalized) as { editedCode?: unknown };
      if (typeof parsed.editedCode === "string") {
        normalized = parsed.editedCode.trim();
      }
    } catch {
      // Ignore parse failures and keep best-effort raw text.
    }
  }

  return normalized;
};

export async function POST(request: Request) {
  try {
    const { userId: authUserId } = await auth();
    const body = await request.json();
    const {
      selectedCode,
      fullCode,
      instruction,
      userId: fallbackUserId,
    } = requestSchema.parse(body);

    // Some local setups can have Clerk client/server session mismatch.
    // Allow a development-only fallback to keep local AI quick edit usable.
    const userId = authUserId ??
      (process.env.NODE_ENV !== "production" ? fallbackUserId : undefined);

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!selectedCode) {
      return NextResponse.json(
        { error: "Selected code is required" },
        { status: 400 }
      );
    }

    if (!instruction) {
      return NextResponse.json(
        { error: "Instruction is required" },
        { status: 400 }
      );
    }

    const urls: string[] = instruction.match(URL_REGEX) || [];
    let documentationContext = "";

    if (urls.length > 0) {
      const scrapedResults = await Promise.all(
        urls.map(async (url) => {
          try {
            const result = await firecrawl.scrape(url, {
              formats: ["markdown"],
            });

            if (result.markdown) {
              return `<doc url="${url}">\n${result.markdown}\n</doc>`;
            }

            return null;
          } catch {
            return null;
          }
        })
      );

      const validResults = scrapedResults.filter(Boolean);

      if (validResults.length > 0) {
        documentationContext = `<documentation>\n${validResults.join("\n\n")}\n</documentation>`;
      }
    }

    const prompt = QUICK_EDIT_PROMPT
      .replace("{selectedCode}", selectedCode)
      .replace("{fullCode}", fullCode || "")
      .replace("{instruction}", instruction)
      .replace("{documentation}", documentationContext);

    const { text } = await generateText({
      model: groq("llama-3.3-70b-versatile"),
      prompt: `${prompt}\n\nReturn only the edited code. Do not return JSON or markdown code fences.`,
    });

    return NextResponse.json({ editedCode: normalizeEditedCode(text) });
  } catch (error) {
    if (isAbortLikeError(error)) {
      return NextResponse.json(
        { error: "Request aborted" },
        { status: 499 }
      );
    }

    console.error("Edit error:", error);

    if (isInvalidProviderApiKeyError(error)) {
      return NextResponse.json(
        { error: INVALID_GROQ_API_KEY_MESSAGE },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Failed to generate edit" },
      { status: 500 }
    );
  }
};
