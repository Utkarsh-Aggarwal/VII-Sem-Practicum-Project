import { EventEmitter } from "node:events";

// In-process pub/sub that feeds the dashboard's live updates (/api/events, Server-Sent Events).
// Single-node only — swap for Redis pub/sub if the backend is ever scaled horizontally.

export type CareEvent = {
  elderId: string;
  type:
    | "checkin.updated"
    | "reminder.dispatched"
    | "alert.created"
    | "alert.updated"
    | "telemetry"
    | "selfreport.created"
    | "mood.created"
    | "chat.message"
    | "conversation.summarized"
    | "device.status"
    | "note.created";
  payload?: unknown;
};

const globalForEvents = globalThis as unknown as { careEvents?: EventEmitter };

export const careEvents = globalForEvents.careEvents ?? new EventEmitter();
careEvents.setMaxListeners(200);
globalForEvents.careEvents = careEvents;

export function emitCareEvent(event: CareEvent) {
  careEvents.emit("event", event);
}
