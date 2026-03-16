import { useEffect, useRef, useState, useCallback } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// SW registration & config push
async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', type: 'module' });
    // Pass Supabase config to SW
    const sendConfig = () => {
      reg.active?.postMessage({
        type: 'SET_CONFIG',
        config: {
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
          supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
          reminderHour: 8,
          reminderMinute: 0,
        },
      });
    };
    if (reg.active) sendConfig();
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker?.addEventListener('statechange', () => {
        if (newWorker.state === 'activated') sendConfig();
      });
    });

    // Request periodic background sync if available
    if ('periodicSync' in reg) {
      try {
        const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
        if (status.state === 'granted') {
          await (reg as unknown as { periodicSync: { register: (tag: string, opts: { minInterval: number }) => Promise<void> } }).periodicSync.register('clock-in-reminder', {
            minInterval: 60 * 60 * 1000, // 1 hour
          });
        }
      } catch {
        // periodic sync not supported — fallback handled in-app
      }
    }

    return reg;
  } catch (err) {
    console.warn('SW registration failed:', err);
    return null;
  }
}

// Request notification permission
async function requestNotifPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PwaInstallPrompt() {
  const [showBanner, setShowBanner] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  // Register SW on mount
  useEffect(() => {
    registerSW();
    requestNotifPermission();
  }, []);

  // Listen for install prompt
  useEffect(() => {
    const alreadyInstalled = window.matchMedia('(display-mode: standalone)').matches;
    if (alreadyInstalled) {
      setInstalled(true);
      return;
    }
    const dismissed = sessionStorage.getItem('pwa-banner-dismissed');
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      if (!dismissed) setShowBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const installedHandler = () => {
      setInstalled(true);
      setShowBanner(false);
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt.current) return;
    deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    deferredPrompt.current = null;
    setShowBanner(false);
  }, []);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    sessionStorage.setItem('pwa-banner-dismissed', '1');
  }, []);

  if (!showBanner || installed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-lg">
        <Download className="h-8 w-8 shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Installer HR Hub</p>
          <p className="text-xs text-muted-foreground">
            Installez l'application pour recevoir les rappels de pointage même quand le navigateur est fermé.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" onClick={handleInstall}>
            Installer
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
