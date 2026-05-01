import { inngest } from "@/inngest/client";
import { Id } from "../../../../convex/_generated/dataModel";
import { NonRetriableError } from "inngest";
import { convex } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";
import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import {
  INVALID_GROQ_API_KEY_MESSAGE,
  isInvalidProviderApiKeyError,
} from "@/lib/ai-provider-errors";
import { 
  CODING_AGENT_SYSTEM_PROMPT, 
  TITLE_GENERATOR_SYSTEM_PROMPT
} from "./constants";
import { DEFAULT_CONVERSATION_TITLE } from "../constants";

interface MessageEvent {
  messageId: Id<"messages">;
  conversationId: Id<"conversations">;
  projectId: Id<"projects">;
  message: string;
};

export const processMessage = inngest.createFunction(
  {
    id: "process-message",
    cancelOn: [
      {
        event: "message/cancel",
        if: "event.data.messageId == async.data.messageId",
      },
    ],
    onFailure: async ({ event, step, error }) => {
      const { messageId } = event.data.event.data as MessageEvent;
      const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;
      const isProviderKeyError = isInvalidProviderApiKeyError(error);

      // Update the message with error content
      if (internalKey) {
        await step.run("update-message-on-failure", async () => {
          await convex.mutation(api.system.updateMessageContent, {
            internalKey,
            messageId,
            content: isProviderKeyError
              ? "AI is unavailable because GROQ_API_KEY is invalid. Update .env.local, restart dev servers, and try again."
              : "My apologies, I encountered an error while processing your request. Let me know if you need anything else!",
          });
        });
      }
    }
  },
  {
    event: "message/sent",
  },
  async ({ event, step }) => {
    const { 
      messageId, 
      conversationId,
      message
    } = event.data as MessageEvent;

    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY; 

    if (!internalKey) {
      throw new NonRetriableError("POLARIS_CONVEX_INTERNAL_KEY is not configured");
    }

    const groqApiKey = process.env.GROQ_API_KEY;

    if (!groqApiKey) {
      throw new NonRetriableError("GROQ_API_KEY is not configured");
    }

    // TODO: Check if this is needed
    await step.sleep("wait-for-db-sync", "1s");

    // Get conversation for title generation check
    const conversation = await step.run("get-conversation", async () => {
      return await convex.query(api.system.getConversationById, {
        internalKey,
        conversationId,
      });
    });

    if (!conversation) {
      throw new NonRetriableError("Conversation not found");
    }

    // Fetch recent messages for conversation context
    const recentMessages = await step.run("get-recent-messages", async () => {
      return await convex.query(api.system.getRecentMessages, {
        internalKey,
        conversationId,
        limit: 10,
      });
    });

    // Build prompt with conversation history (exclude the current processing message)
    const baseSystemPrompt = CODING_AGENT_SYSTEM_PROMPT;

    const contextMessages = recentMessages.filter(
      (msg) => msg._id !== messageId && msg.content.trim() !== ""
    );

    const historyText =
      contextMessages.length > 0
        ? contextMessages
            .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
            .join("\n\n")
        : "";

    // Generate conversation title if it's still the default
    const shouldGenerateTitle =
      conversation.title === DEFAULT_CONVERSATION_TITLE;

    if (shouldGenerateTitle) {
      const title = await step.run("generate-title", async () => {
        try {
          const { text } = await generateText({
            model: groq("llama-3.3-70b-versatile"),
            system: TITLE_GENERATOR_SYSTEM_PROMPT,
            prompt: message,
          });

          return text
            .split("\n")[0]
            ?.trim()
            .replace(/["'`]+/g, "")
            .slice(0, 80);
        } catch (error) {
          if (isInvalidProviderApiKeyError(error)) {
            throw new NonRetriableError(INVALID_GROQ_API_KEY_MESSAGE);
          }

          throw error;
        }
      });

      if (title) {
        await step.run("update-conversation-title", async () => {
          await convex.mutation(api.system.updateConversationTitle, {
            internalKey,
            conversationId,
            title,
          });
        });
      }
    }

    let assistantResponse =
      "I processed your request. Let me know if you need anything else!";

    assistantResponse = await step.run("generate-response", async () => {
      const promptParts = [
        historyText ? `## Conversation History\n${historyText}` : "",
        "## Current Request\nRespond to the user's most recent message.",
        `USER: ${message}\n\nASSISTANT:`
      ].filter(Boolean);

      try {
        const { text } = await generateText({
          model: groq("llama-3.3-70b-versatile"),
          system: baseSystemPrompt,
          prompt: promptParts.join("\n\n"),
        });

        return text.trim();
      } catch (error) {
        if (isInvalidProviderApiKeyError(error)) {
          throw new NonRetriableError(INVALID_GROQ_API_KEY_MESSAGE);
        }

        throw error;
      }
    });

    // Update the assistant message with the response (this also sets status to completed)
    await step.run("update-assistant-message", async () => {
      await convex.mutation(api.system.updateMessageContent, {
        internalKey,
        messageId,
        content: assistantResponse,
      })
    });

    return { success: true, messageId, conversationId };
  }
);

