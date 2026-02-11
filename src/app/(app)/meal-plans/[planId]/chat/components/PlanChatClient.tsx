'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Textarea } from '@/components/catalyst/textarea';
import { Button } from '@/components/catalyst/button';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { submitPlanChatMessageAction } from '../actions/planChat.actions';
import { Loader2, Send, CheckCircle2 } from 'lucide-react';
import type { PlanChatMessage } from '@/src/lib/agents/meal-planner/planEdit.schemas';
import { GuardrailsViolationMessage } from './GuardrailsViolationMessage';

type PlanChatClientProps = {
  planId: string;
  initialDraft?: string;
  onDraftChange?: (draft: string) => void;
  dietTypeId?: string; // Optional diet type ID for linking to guardrails settings
};

// Extended message type for UI (includes system/error messages)
type ExtendedChatMessage =
  | PlanChatMessage
  | {
      role: 'system';
      type: 'guardrails_violation';
      reasonCodes: string[];
      contentHash: string;
      rulesetVersion?: number;
      dietTypeId?: string;
    };

export function PlanChatClient({
  planId,
  initialDraft,
  onDraftChange,
  dietTypeId,
}: PlanChatClientProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [input, setInput] = useState(initialDraft || '');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastApplied, setLastApplied] = useState<{
    planId: string;
    changed: { type: string; date?: string; mealSlot?: string };
    summary: string;
  } | null>(null);

  // Update input when initialDraft changes (for injected prompts)
  React.useEffect(() => {
    if (initialDraft !== undefined) {
      setInput(initialDraft);
      if (onDraftChange) {
        onDraftChange(initialDraft);
      }
    }
  }, [initialDraft, onDraftChange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isPending) return;

    const userMessage: PlanChatMessage = {
      role: 'user',
      content: input.trim(),
    };

    // Append user message
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setError(null);

    startTransition(async () => {
      try {
        // Send last 12 messages (to keep context manageable)
        // Filter out system messages when sending to backend
        const messagesToSend = newMessages
          .filter((msg): msg is PlanChatMessage => msg.role !== 'system')
          .slice(-12);

        const result = await submitPlanChatMessageAction({
          planId,
          messages: messagesToSend,
        });

        if (result.ok) {
          // Append assistant reply
          const assistantMessage: PlanChatMessage = {
            role: 'assistant',
            content: result.data.reply,
          };
          setMessages([...newMessages, assistantMessage]);

          // Store applied edit if present
          if (result.data.applied) {
            setLastApplied(result.data.applied);
          }

          // Refresh page to show updated plan
          router.refresh();
        } else {
          // Check for GUARDRAILS_VIOLATION
          if (
            result.error.code === 'GUARDRAILS_VIOLATION' &&
            result.error.details
          ) {
            // Add guardrails violation message to chat
            const violationMessage: ExtendedChatMessage = {
              role: 'system',
              type: 'guardrails_violation',
              reasonCodes: result.error.details.reasonCodes,
              contentHash: result.error.details.contentHash,
              rulesetVersion: result.error.details.rulesetVersion,
              dietTypeId: dietTypeId,
            };
            setMessages([...newMessages, violationMessage]);
            // Don't set generic error for GUARDRAILS_VIOLATION
          } else {
            setError(result.error.message);
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Fout bij versturen bericht',
        );
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <Heading>Chat</Heading>
        <div className="mt-4">
          {/* Messages */}
          <div className="mb-4 max-h-[500px] min-h-[300px] space-y-4 overflow-y-auto">
            {messages.length === 0 && (
              <div className="py-8 text-center text-zinc-500 dark:text-zinc-400">
                <Text>
                  Stel een vraag of vraag om een aanpassing aan je weekmenu.
                </Text>
                <Text className="mt-2 text-sm">
                  Bijvoorbeeld: &quot;Maak maandag gezonder&quot; of
                  &quot;Vervang het ontbijt op dinsdag&quot;
                </Text>
              </div>
            )}

            {messages.map((msg, idx) => {
              // Handle system messages (guardrails violation)
              if (
                msg.role === 'system' &&
                msg.type === 'guardrails_violation'
              ) {
                return (
                  <div key={idx} className="flex justify-start">
                    <div className="w-full max-w-[80%]">
                      <GuardrailsViolationMessage
                        reasonCodes={msg.reasonCodes}
                        contentHash={msg.contentHash}
                        rulesetVersion={msg.rulesetVersion}
                        dietTypeId={msg.dietTypeId}
                      />
                    </div>
                  </div>
                );
              }

              // Handle regular user/assistant messages
              return (
                <div
                  key={idx}
                  className={`flex ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-zinc-100 dark:bg-zinc-800'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">
                      {'content' in msg ? msg.content : ''}
                    </p>
                  </div>
                </div>
              );
            })}

            {isPending && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-zinc-100 px-4 py-2 dark:bg-zinc-800">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Denken...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
              <strong>Fout:</strong> {error}
            </div>
          )}

          {/* Applied status */}
          {lastApplied && (
            <div className="mb-4 rounded-lg bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  <strong>Toegepast:</strong> {lastApplied.summary}
                </span>
              </div>
              <Link
                href={`/meal-plans/${planId}/shopping`}
                className="mt-1 block text-sm underline"
              >
                Bekijk bijgewerkt plan →
              </Link>
            </div>
          )}

          {/* Input form */}
          <form onSubmit={handleSubmit} className="space-y-2">
            <Textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (onDraftChange) {
                  onDraftChange(e.target.value);
                }
              }}
              placeholder="Typ je bericht..."
              disabled={isPending}
              rows={3}
              className="resize-none"
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={!input.trim() || isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verzenden...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Verzenden
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
