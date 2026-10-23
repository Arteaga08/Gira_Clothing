import { ANNOUNCEMENT_MAX_LENGTH, ANNOUNCEMENT_MAX_MESSAGES } from "@gira/shared";

/**
 * Announcement bar form helpers. The drafts keep blank rows while the owner
 * types; `cleanAnnouncementMessages` is what actually travels to the API.
 */

type AnnouncementParseResult = { messages: string[] } | { error: string };

const cleanAnnouncementMessages = (drafts: readonly string[]): string[] =>
  drafts.map((draft) => draft.trim()).filter((draft) => draft.length > 0);

const parseAnnouncement = (enabled: boolean, drafts: readonly string[]): AnnouncementParseResult => {
  const messages = cleanAnnouncementMessages(drafts);
  if (messages.length > ANNOUNCEMENT_MAX_MESSAGES) {
    return { error: `Máximo ${ANNOUNCEMENT_MAX_MESSAGES} mensajes.` };
  }
  if (messages.some((message) => message.length > ANNOUNCEMENT_MAX_LENGTH)) {
    return { error: `Cada mensaje admite hasta ${ANNOUNCEMENT_MAX_LENGTH} caracteres.` };
  }
  if (enabled && messages.length === 0) return { error: "Agrega al menos un mensaje para mostrar la barra." };
  return { messages };
};

export type { AnnouncementParseResult };
export { cleanAnnouncementMessages, parseAnnouncement };
