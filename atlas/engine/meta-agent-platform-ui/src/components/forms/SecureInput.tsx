import { forwardRef, useMemo } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SecureInputProps extends InputHTMLAttributes<HTMLInputElement> {
  sanitize?: boolean;
  allowedChars?: RegExp;
  error?: string | null;
}

const sanitizeValue = (value: string, allowedChars?: RegExp) => {
  if (!allowedChars) {
    return value;
  }
  const regex = new RegExp(allowedChars);
  if (regex.test(value)) {
    return value;
  }
  return value
    .split('')
    .filter((char) => allowedChars.test(char))
    .join('');
};

export const SecureInput = forwardRef<HTMLInputElement, SecureInputProps>(function SecureInput(
  { className, value = '', onChange, sanitize = false, allowedChars, error, ...props },
  ref,
) {
  const safeValue = useMemo(() => {
    if (!sanitize || typeof value !== 'string') {
      return value;
    }
    if (allowedChars) {
      return sanitizeValue(value, allowedChars);
    }
    return value.trimStart();
  }, [value, sanitize, allowedChars]);

  return (
    <div className="space-y-2">
      <Input
        ref={ref}
        value={safeValue}
        onChange={(event) => {
          const next = sanitize ? sanitizeValue(event.target.value, allowedChars) : event.target.value;
          onChange?.({
            ...event,
            target: { ...event.target, value: next },
          } as React.ChangeEvent<HTMLInputElement>);
        }}
        className={cn(error ? 'border-destructive focus-visible:ring-destructive' : '', className)}
        {...props}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
});

export const useEmailValidation = () => {
  const validateEmail = (email: string): string | null => {
    if (!email) {
      return 'Email is required.';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Please enter a valid email address.';
    }
    return null;
  };

  return { validateEmail };
};
