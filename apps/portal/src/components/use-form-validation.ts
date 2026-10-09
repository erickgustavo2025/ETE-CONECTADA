'use client';
import { useState } from 'react';
export function useFormValidation(errorId: string) {
 const [error, setError] = useState('');
 const [invalid, setInvalid] = useState('');
 function validate(form: HTMLFormElement) {
  for (const element of Array.from(form.elements)) {
   if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) || !element.willValidate) continue;
   if (!element.validity.valid) {
    const label = (element.labels?.[0]?.textContent || 'este campo').trim().replace(/\s*\*$/, '');
    setError(element.validity.valueMissing ? element.type === 'checkbox' ? 'Marque a confirmação após conferir os dados.' : `Preencha o campo ${label}.` : element.type === 'email' ? 'Informe um e-mail válido.' : element.validity.tooShort && 'minLength' in element ? `Use pelo menos ${element.minLength} caracteres.` : `Confira o campo ${label}.`);
    setInvalid(element.name); element.focus(); return false;
   }
  }
  const password = form.elements.namedItem('newPassword') as HTMLInputElement | null;
  const confirmation = form.elements.namedItem('confirmPassword') as HTMLInputElement | null;
  if (password && confirmation && password.value !== confirmation.value) {
   setError('As senhas precisam ser iguais.'); setInvalid(confirmation.name); confirmation.focus(); return false;
  }
  setError(''); setInvalid(''); return true;
 }
 function field(name: string) { return { 'aria-invalid': invalid === name || undefined, 'aria-describedby': invalid === name ? errorId : undefined }; }
 function reject(name: string, message: string, form: HTMLFormElement) {
  setInvalid(name); setError(message);
  (form.elements.namedItem(name) as HTMLElement | null)?.focus();
 }
 function reset() { setInvalid(''); setError(''); }
 return { error, validate, field, reject, reset };
}
