"use client";

import { useEffect, useRef } from "react";

function getSessionId() {
  try {
    const key = "nfc-smart-session";
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return "";
  }
}

async function track(companyId: string, eventType: "page_view" | "action_click", actionId?: string, contactType?: string) {
  try {
    await fetch("/api/analytics/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId, eventType, actionId, contactType, sessionId: getSessionId() }),
      keepalive: true,
    });
  } catch {
    // Analytics must never block the public page.
  }
}

export function PublicInteractions({ companyId }: { companyId: string }) {
  const trackedCompany = useRef("");
  useEffect(() => {
    if (trackedCompany.current !== companyId) {
      track(companyId, "page_view");
      trackedCompany.current = companyId;
    }

    const handler = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const action = target?.closest("[data-action-id],[data-contact]") as HTMLElement | null;
      if (action?.dataset.actionId) track(companyId, "action_click", action.dataset.actionId);
      else if (action?.dataset.contact) track(companyId, "action_click", undefined, action.dataset.contact);
    };

    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [companyId]);

  return null;
}
