"use client";
import {useEffect,useRef} from "react";

export function useModal(open: boolean, close: () => void) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = ref.current;
    const selectors = 'button,a[href],input,select,textarea,[tabindex="0"]';
    (dialog?.querySelector(selectors) as HTMLElement | null)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if(event.key === "Escape") closeRef.current();
      if(event.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(selectors)].filter(el=>!el.hasAttribute("disabled"));
      const first = items[0], last = items[items.length-1];
      if(event.shiftKey && document.activeElement === first) { event.preventDefault();last?.focus(); }
      else if(!event.shiftKey && document.activeElement === last) { event.preventDefault();first?.focus(); }
    };
    document.addEventListener("keydown",keydown);
    return () => {
      document.body.style.overflow=overflow;
      document.removeEventListener("keydown",keydown);
      previous?.focus();
    };
  },[open]);
  return ref;
}
