import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CountrySelectorProps {
  value: string;
  onChange: (value: string) => void;
  autoDetect?: boolean;
}

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'DE', name: 'Germany' },
  { code: 'IN', name: 'India' },
];

export function CountrySelector({ value, onChange, autoDetect = false }: CountrySelectorProps) {
  const defaultCountry = useMemo(() => {
    if (!autoDetect || typeof window === 'undefined') {
      return '';
    }
    try {
      return new Intl.Locale(navigator.language).region ?? '';
    } catch {
      return '';
    }
  }, [autoDetect]);

  const selected = value || defaultCountry;

  return (
    <div className="space-y-2">
      <Label className="text-sm">Country</Label>
      <Select value={selected} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select your country" />
        </SelectTrigger>
        <SelectContent>
          {COUNTRIES.map((country) => (
            <SelectItem key={country.code} value={country.code}>
              {country.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
