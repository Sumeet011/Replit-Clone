import ky, { HTTPError } from "ky";
import { z } from "zod";
import { toast } from "sonner";

const editRequestSchema = z.object({
  selectedCode: z.string(),
  fullCode: z.string(),
  instruction: z.string(),
  userId: z.string().optional(),
});

const editResponseSchema = z.object({
  editedCode: z.string(),
});

type EditRequest = z.infer<typeof editRequestSchema>;
type EditResponse = z.infer<typeof editResponseSchema>;

export const fetcher = async (
  payload: EditRequest,
  signal: AbortSignal,
): Promise<string | null> => {
  try {
    const validatedPayload = editRequestSchema.parse(payload);

    const response = await ky
      .post("/api/quick-edit", {
        json: validatedPayload,
        credentials: "include",
        signal,
        timeout: 30_000,
        retry: 0,
      })
      .json<EditResponse>();

    const validatedResponse = editResponseSchema.parse(response);

    return validatedResponse.editedCode || null;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return null;
    }

    if (error instanceof HTTPError) {
      let errorMessage = "Failed to fetch AI quick edit";

      try {
        const body = await error.response.clone().json() as { error?: string };
        if (body?.error) {
          errorMessage = body.error;
        }
      } catch {
        // Keep fallback when response body is not JSON.
      }

      toast.error(errorMessage);
      return null;
    }

    toast.error("Failed to fetch AI quick edit");
    return null;
  }
};
