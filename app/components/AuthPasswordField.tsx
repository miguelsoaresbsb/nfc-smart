"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id"> & {
  id: string;
  label: string;
  hint?: string;
  revealLabel?: string;
};

export default function AuthPasswordField({ id, label, hint, revealLabel = label.toLowerCase(), disabled, ...input }: Props) {
  const [visible, setVisible] = useState(false);
  const describedBy = [input["aria-describedby"], hint ? id + "-hint" : ""].filter(Boolean).join(" ");
  return <div className="auth-field">
    <label htmlFor={id}>{label}</label>
    <div className="auth-password-control">
      <input autoCapitalize="none" autoCorrect="off" spellCheck={false} {...input} id={id} type={visible ? "text" : "password"} disabled={disabled} aria-describedby={describedBy || undefined}/>
      <button className="auth-password-toggle" type="button" disabled={disabled} aria-controls={id} aria-pressed={visible} aria-label={(visible ? "Ocultar " : "Mostrar ") + revealLabel} onClick={() => setVisible(value => !value)}>
        {visible ? <EyeOff size={19} aria-hidden="true"/> : <Eye size={19} aria-hidden="true"/>}
      </button>
    </div>
    {hint && <small id={id + "-hint"} className="auth-field-hint">{hint}</small>}
  </div>;
}
