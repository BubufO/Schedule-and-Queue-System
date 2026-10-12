// Account field rules. The register screen uses them for inline errors, and the dummy gateway
// re-checks them the way the real backend's request models will, so a bypassed form still fails.
// Each returns an error message, or undefined when the value is acceptable.

export const PasswordMinLength = 8;

export function validateDisplayName(value: string) {
  if (!value.trim()) return 'Enter your name.';
  if (value.trim().length > 60) return 'Keep your name under 60 characters.';
}

export function validateUsername(value: string) {
  const v = value.trim();
  if (!v) return 'Choose a username.';
  if (v.length < 3 || v.length > 32) return 'Use 3 to 32 characters.';
  if (!/^[a-zA-Z0-9._-]+$/.test(v)) return 'Use letters, numbers, dots, dashes or underscores.';
}

export function validatePassword(value: string) {
  if (!value) return 'Choose a password.';
  if (value.length < PasswordMinLength) return `Use at least ${PasswordMinLength} characters.`;
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) return 'Include at least one letter and one number.';
}

export function validateEmail(value: string) {
  const v = value.trim();
  if (!v) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address.';
}

// Optional unless the person wants their code by text.
export function validatePhone(value: string, required: boolean) {
  const digits = normalizePhone(value);
  if (!digits) return required ? 'Enter a phone number to receive a text.' : undefined;
  if (digits.replace('+', '').length < 10 || digits.replace('+', '').length > 15) {
    return 'Enter a valid phone number, including area code.';
  }
}

// Keeps digits and a leading +, so "(555) 012-3456" and "555.012.3456" compare equal.
export function normalizePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') && digits ? `+${digits}` : digits;
}
