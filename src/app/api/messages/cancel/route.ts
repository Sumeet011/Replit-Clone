import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { inngest } from "@/inngest/client";
import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

const requestSchema = z.object({
  projectId: z.string(),
  userId: z.string().optional(),
});

export async function POST(request: Request) {
  const { userId: authUserId } = await auth();

  const body = await request.json();
  const { projectId, userId: fallbackUserId } = requestSchema.parse(body);

  // Some local setups can have Clerk client/server session mismatch.
  // Allow a development-only fallback to keep local AI chat usable.
  const userId = authUserId ??
    (process.env.NODE_ENV !== "production" ? fallbackUserId : undefined);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;

  if (!internalKey) {
    return NextResponse.json(
      { error: "Internal key not configured" },
      { status: 500 }
    );
  }

  // Find all processing messages in this project
  const processingMessages = await convex.query(
    api.system.getProcessingMessages,
    {
      internalKey,
      projectId: projectId as Id<"projects">,
    }
  );

  if (processingMessages.length === 0) {
    return NextResponse.json({ success: true, cancelled: false });
  }

  // Cancel all processing messages
  const cancelledIds = await Promise.all(
    processingMessages.map(async (msg) => {
      await inngest.send({
        name: "message/cancel",
        data: {
          messageId: msg._id,
        },
      });

      await convex.mutation(api.system.updateMessageStatus, {
        internalKey,
        messageId: msg._id,
        status: "cancelled",
      });

      return msg._id;
    })
  );

  return NextResponse.json({
    success: true,
    cancelled: true,
    messageIds: cancelledIds,
  });
};
