export type ContentHistoryOperation = "company" | "profile" | "action" | "restore" | "initial";
export type ContentHistoryVersion = {
  id: string;
  created_at: string;
  actor_id: string | null;
  operation: ContentHistoryOperation;
  summary: { name: string; description: string; action_count: number; buttons: Array<{ label: string; enabled: boolean }> };
};
export type ContentHistory = { revision: string; versions: ContentHistoryVersion[] };

const operations: Record<ContentHistoryOperation, string> = {
  company: "Dados e identidade", profile: "Apresentação", action: "Botões",
  restore: "Antes de uma restauração", initial: "Versão inicial",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Decode only the bounded display payload; never accept a client-made snapshot. */
export function parseContentHistory(value: unknown): ContentHistory {
  if (!record(value) || typeof value.revision !== "string" || !/^[a-f0-9]{32}$/.test(value.revision) || !Array.isArray(value.versions) || value.versions.length > 30) throw new Error("Resposta do histórico inválida.");
  const versions = value.versions.map((version): ContentHistoryVersion => {
    if (!record(version) || typeof version.id !== "string" || !uuid.test(version.id)
      || typeof version.created_at !== "string" || !Number.isFinite(Date.parse(version.created_at))
      || typeof version.operation !== "string" || !Object.hasOwn(operations, version.operation) || !record(version.summary)) throw new Error("Versão do histórico inválida.");
    const summary = version.summary;
    if (typeof summary.name !== "string" || !Number.isSafeInteger(summary.action_count) || Number(summary.action_count) < 0 || !Array.isArray(summary.buttons)) throw new Error("Resumo do histórico inválido.");
    return {
      id: version.id, created_at: version.created_at,
      actor_id: typeof version.actor_id === "string" && uuid.test(version.actor_id) ? version.actor_id : null,
      operation: version.operation as ContentHistoryOperation,
      summary: { name: summary.name.slice(0, 160), description: typeof summary.description === "string" ? summary.description.slice(0, 500) : "",
        action_count: Number(summary.action_count), buttons: summary.buttons.slice(0, 8).flatMap(button => record(button) && typeof button.label === "string" ? [{ label: button.label.slice(0, 100), enabled: button.enabled === true }] : []) },
    };
  });
  return { revision: value.revision, versions };
}

export function historyOperationLabel(operation: ContentHistoryOperation): string { return operations[operation]; }

export function historyRestoreError(code: unknown): string {
  if (code === "40001") return "A página mudou em outra aba. Atualize o histórico e confira a versão antes de restaurar.";
  if (code === "55P03") return "A página está sendo alterada em outra sessão. Aguarde um momento e tente novamente.";
  if (code === "42501") return "A restauração exige permissão de edição e uma assinatura ativa. Confira seu acesso antes de tentar novamente.";
  if (code === "22023") return "Esta versão não está mais disponível. Atualize o histórico para escolher outra.";
  return "Não foi possível confirmar a restauração. Atualize o histórico para conferir sua página antes de tentar novamente.";
}
