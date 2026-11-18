import { formatDay, formatTime } from "@/lib/time/paris";
import { AttachmentList, type ShownAttachment } from "./files/attachment-list";

export interface ThreadMessage {
  id: string;
  author: "client" | "admin";
  body: string;
  created_at: Date;
  contact_name: string | null;
  internal?: boolean;
  attachments?: ShownAttachment[];
}

/**
 * Fil d'un ticket. `viewer` décide des libellés : l'admin voit « Toi » et ses
 * notes internes ; le client voit « Vous » (il ne reçoit jamais de note interne).
 */
export function TicketThread({ messages, viewer }: { messages: ThreadMessage[]; viewer: "admin" | "client" }) {
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const mine = m.author === viewer;
        const who =
          m.author === "admin"
            ? viewer === "admin" ? "Toi" : "Notre équipe"
            : viewer === "client" ? "Vous" : (m.contact_name ?? "Client");
        return (
          <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] space-y-1 rounded-xl border px-4 py-3 ${
                m.internal ? "border-high/40 bg-high/10" : mine ? "border-accent/30 bg-accent/10" : "border-border bg-surface"
              }`}
            >
              <p className="text-xs text-muted">
                <span className="font-medium text-text">{who}</span>
                {m.internal && <span className="font-semibold text-high"> · note interne</span>}
                {" · "}{formatDay(m.created_at)} {formatTime(m.created_at)}
              </p>
              {m.body && <p className="whitespace-pre-line text-sm">{m.body}</p>}
              {m.attachments && m.attachments.length > 0 && <AttachmentList items={m.attachments} tone="bubble" />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
