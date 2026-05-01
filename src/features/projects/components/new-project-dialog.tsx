"use client";

import { useEffect, useState } from "react";
import ky, { HTTPError } from "ky";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";

import { Id } from "../../../../convex/_generated/dataModel";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewProjectDialog = ({
  open,
  onOpenChange,
}: NewProjectDialogProps) => {
  const router = useRouter();
  const { isSignedIn, userId } = useAuth();
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (message: PromptInputMessage) => {
    if (!message.text) return;

    if (!isSignedIn) {
      toast.error("Please sign in to create a project");
      router.push("/sign-in");
      return;
    }

    setIsSubmitting(true);

    try {
      const { projectId } = await ky
        .post("/api/projects/create-with-prompt", {
          json: { prompt: message.text.trim(), userId },
          credentials: "include",
        })
        .json<{ projectId: Id<"projects"> }>();

      toast.success("Project created");
      onOpenChange(false);
      setInput("");
      router.push(`/projects/${projectId}`);
    } catch (error) {
      if (error instanceof HTTPError) {
        if (error.response.status === 401) {
          toast.error("Session expired. Please sign in again.");
          router.push("/sign-in");
        } else {
          let message = "Unable to create project";

          try {
            const body = await error.response.clone().json() as { error?: string };
            if (body.error) {
              message = body.error;
            }
          } catch {
            // Ignore parse failures and keep default message.
          }

          toast.error(message);
        }
      } else {
        toast.error("Unable to create project");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        showCloseButton={false}
        className="sm:max-w-lg p-0"
      >
        <DialogHeader className="hidden">
          <DialogTitle>What do you want to build?</DialogTitle>
          <DialogDescription>
            Describe your project and AI will help you create it.
          </DialogDescription>
        </DialogHeader>
        <PromptInput onSubmit={handleSubmit} className="border-none!">
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Ask Polaris to build..."
              onChange={(e) => setInput(e.target.value)}
              value={input}
              disabled={isSubmitting}
            />
          </PromptInputBody>
          <PromptInputFooter>
             <PromptInputTools />
             <PromptInputSubmit disabled={!input || isSubmitting} />
          </PromptInputFooter>
        </PromptInput>
      </DialogContent>
    </Dialog>
  );
};
