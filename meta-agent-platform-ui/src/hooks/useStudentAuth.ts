import { useCallback } from 'react';

interface StudentDomainInfo {
  institution_name: string;
}

interface UseStudentAuthValue {
  checkStudentEmail: (email: string) => Promise<boolean>;
  getStudentDomainInfo: (email: string) => Promise<StudentDomainInfo | null>;
}

const KNOWN_STUDENT_DOMAINS: Record<string, string> = {
  'edu': 'U.S. Education Network',
  'ac.uk': 'United Kingdom Academic Network',
  'ac.in': 'India Academic Network',
};

const resolveDomain = (email: string): string | null => {
  const parts = email.split('@');
  if (parts.length !== 2) {
    return null;
  }
  return parts[1].toLowerCase();
};

export function useStudentAuth(): UseStudentAuthValue {
  const checkStudentEmail = useCallback(async (email: string) => {
    const domain = resolveDomain(email);
    if (!domain) {
      return false;
    }
    if (domain.endsWith('.edu')) return true;
    if (domain.endsWith('.ac.uk')) return true;
    if (domain.endsWith('.ac.in')) return true;
    return Boolean(KNOWN_STUDENT_DOMAINS[domain]);
  }, []);

  const getStudentDomainInfo = useCallback(async (email: string) => {
    const domain = resolveDomain(email);
    if (!domain) {
      return null;
    }
    if (domain.endsWith('.edu')) {
      return { institution_name: 'Accredited University' };
    }
    if (domain.endsWith('.ac.uk')) {
      return { institution_name: 'UK Academic Network' };
    }
    if (domain.endsWith('.ac.in')) {
      return { institution_name: 'India Academic Network' };
    }
    const known = KNOWN_STUDENT_DOMAINS[domain];
    if (!known) {
      return null;
    }
    return { institution_name: known };
  }, []);

  return {
    checkStudentEmail,
    getStudentDomainInfo,
  };
}
