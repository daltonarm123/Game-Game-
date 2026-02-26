export function splitPigeonMessages(messages: Array<{ subject?: string | null }>) {
  const inbox = messages.filter((m) => !String(m.subject || "").startsWith("Sent:"));
  const outbox = messages.filter((m) => String(m.subject || "").startsWith("Sent:"));
  return { inbox, outbox };
}

export function paginationWindow(total: number, page: number, pageSize: number) {
  if (total <= 0) return { start: 0, end: 0 };
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);
  return { start, end };
}
