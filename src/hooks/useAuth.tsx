import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'manager' | 'bureau' | 'terrain';

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  position: string | null;
  department: string | null;
  base_salary: number | null;
  rules_accepted: boolean;
  is_approved: boolean;
  date_of_birth: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  national_id: string | null;
  archived: boolean;
  archived_at: string | null;
  archive_reason: string | null;
  hire_date: string | null;
  matricule: string | null;
  counters_reset_at: string | null;
  is_paused: boolean;
  paused_at: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  isApproved: boolean;
  rulesAccepted: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfileAndRole = async (userId: string) => {
    try {
      const [profileRes, roleRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', userId).single(),
        supabase.rpc('get_user_role', { _user_id: userId }),
      ]);
      if (profileRes.data) setProfile(profileRes.data as Profile);
      if (roleRes.data) setRole(roleRes.data as AppRole);

      // Si une erreur de schéma survient, retenter après 2s
      if (profileRes.error || roleRes.error) {
        console.warn('Erreur chargement profil, nouvelle tentative...', profileRes.error || roleRes.error);
        await new Promise((r) => setTimeout(r, 2000));
        const [p2, r2] = await Promise.all([
          supabase.from('profiles').select('*').eq('user_id', userId).single(),
          supabase.rpc('get_user_role', { _user_id: userId }),
        ]);
        if (p2.data) setProfile(p2.data as Profile);
        if (r2.data) setRole(r2.data as AppRole);
      }
    } catch (err) {
      console.error('Erreur fetchProfileAndRole:', err);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfileAndRole(user.id);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchProfileAndRole(session.user.id), 0);
        } else {
          setProfile(null);
          setRole(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfileAndRole(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isApproved = profile?.is_approved ?? false;
  const rulesAccepted = profile?.rules_accepted ?? false;

  return (
    <AuthContext.Provider value={{ user, session, profile, role, loading, isApproved, rulesAccepted, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
