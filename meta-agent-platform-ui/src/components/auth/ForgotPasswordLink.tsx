import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export function ForgotPasswordLink() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleReset = async () => {
    if (!email) {
      toast({
        title: 'Email required',
        description: 'Please enter your email address to request a reset link.',
        variant: 'destructive',
      });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined,
    });
    setSubmitting(false);
    if (error) {
      toast({
        title: 'Reset failed',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Check your email',
      description: 'We sent you a password reset link.',
    });
  };

  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted-foreground">Forgot password?</p>
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button variant="outline" onClick={handleReset} disabled={submitting}>
          {submitting ? 'Sending…' : 'Reset'}
        </Button>
      </div>
    </div>
  );
}
