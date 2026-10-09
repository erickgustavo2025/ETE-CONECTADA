"use client";
import { useState, type InputHTMLAttributes } from "react";
export default function PasswordInput(
  props: InputHTMLAttributes<HTMLInputElement>,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-wrap">
      <input {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        disabled={props.disabled}
        className="ete-button ete-button--quiet ete-button--compact password-toggle"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}
