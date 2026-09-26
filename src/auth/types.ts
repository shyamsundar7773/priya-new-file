import type { Session, User } from '@supabase/supabase-js';

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

export interface AuthState {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  error: string | null;
}
