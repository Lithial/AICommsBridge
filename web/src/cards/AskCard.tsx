import { useState } from "preact/hooks";
import type { AskPayload } from "../types";

const fmt = (ms: number): string => new Date(ms).toLocaleTimeString();

export function AskCard({
  payload,
  onRespond,
}: {
  payload: AskPayload;
  onRespond: (requestId: string, answer: string) => Promise<void>;
}) {
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");

  if (payload.answer !== null) {
    return (
      <div class="card ask-answered">
        <div class="ask-question">{payload.question}</div>
        <div class="ask-answer-row">
          <span class="ask-answer-text">{payload.answer}</span>
          {payload.answeredAt != null && (
            <span class="ask-answered-at">{fmt(payload.answeredAt)}</span>
          )}
        </div>
      </div>
    );
  }

  const submit = async (answer: string): Promise<void> => {
    setDisabled(true);
    setError(null);
    try {
      await onRespond(payload.requestId, answer);
    } catch {
      setDisabled(false);
      setError("Failed to submit — try again");
    }
  };

  return (
    <div class="card ask-pending">
      <div class="ask-question">{payload.question}</div>
      {payload.options != null ? (
        <div class="ask-options">
          {payload.options.map((opt) => (
            <button
              key={opt}
              class="ask-option-btn"
              disabled={disabled}
              onClick={() => { void submit(opt); }}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : payload.placeholder != null ? (
        <div class="ask-freetext">
          <textarea
            class="ask-textarea"
            placeholder={payload.placeholder}
            value={text}
            onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
            disabled={disabled}
            rows={3}
          />
          <button
            class="ask-submit-btn"
            disabled={disabled || text.trim() === ""}
            onClick={() => { void submit(text.trim()); }}
          >
            Submit
          </button>
        </div>
      ) : (
        <div class="ask-approval">
          <button class="ask-approve-btn" disabled={disabled} onClick={() => { void submit("approve"); }}>
            Approve
          </button>
          <button class="ask-reject-btn" disabled={disabled} onClick={() => { void submit("reject"); }}>
            Reject
          </button>
        </div>
      )}
      {error != null && <div class="ask-error">{error}</div>}
    </div>
  );
}
