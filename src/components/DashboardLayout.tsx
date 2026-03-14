import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePresenceDetection } from '@/hooks/usePresenceDetection';
import AppSidebar from './AppSidebar';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isApproved, rulesAccepted } = useAuth();

  // WiFi presence detection — arrival/departure reminders
  usePresenceDetection();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Not approved or rules not accepted → redirect to login (which shows pending screen)
  if (!isApproved || !rulesAccepted) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
