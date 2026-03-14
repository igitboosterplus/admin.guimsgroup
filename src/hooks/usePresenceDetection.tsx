import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

// Intervals
const IP_CHECK_INTERVAL = 2 * 60 * 1000;   // Check IP every 2 min
const ARRIVAL_REMINDER_DELAY = 10 * 60 * 1000; // 10 min after WiFi detected
const DEPARTURE_AUTO_DELAY = 20 * 60 * 1000;   // 20 min after WiFi lost

type PresenceState = 'away' | 'on-site' | 'reminded';

export function usePresenceDetection() {
  const { user, role } = useAuth();
  const { toast } = useToast();

  const presenceState = useRef<PresenceState>('away');
  const arrivalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const departureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const officeIp = useRef<string>('');
  const notifPermission = useRef<NotificationPermission>('default');

  // Request browser notification permission once
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        notifPermission.current = perm;
      });
    } else if ('Notification' in window) {
      notifPermission.current = Notification.permission;
    }
  }, []);

  const sendNotification = useCallback(
    (title: string, body: string) => {
      // In-app toast always
      toast({ title, description: body });

      // Browser notification if allowed
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/logos/guims group.jpg' });
      }
    },
    [toast],
  );

  const getTodayRecord = useCallback(async () => {
    if (!user) return null;
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_id', user.id)
      .gte('clock_in', today)
      .order('clock_in', { ascending: false })
      .limit(1);
    return data && data.length > 0 ? data[0] : null;
  }, [user]);

  const clearTimers = useCallback(() => {
    if (arrivalTimer.current) {
      clearTimeout(arrivalTimer.current);
      arrivalTimer.current = null;
    }
    if (departureTimer.current) {
      clearTimeout(departureTimer.current);
      departureTimer.current = null;
    }
  }, []);

  const checkPresence = useCallback(async () => {
    if (!user || !officeIp.current || officeIp.current === '0.0.0.0') return;

    // Fetch current IP
    let currentIp = '';
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      currentIp = data.ip;
    } catch {
      return; // network error → skip this cycle
    }

    const isOnSite = currentIp === officeIp.current;
    const record = await getTodayRecord();
    const hasClockedIn = !!record;
    const hasClockedOut = !!record?.clock_out;

    if (isOnSite) {
      // ─── User is on the office WiFi ───
      if (departureTimer.current) {
        // They came back before 20 min → cancel departure warning
        clearTimeout(departureTimer.current);
        departureTimer.current = null;
      }

      if (!hasClockedIn && presenceState.current === 'away') {
        // Just arrived, hasn't clocked in → start 10 min timer
        presenceState.current = 'on-site';
        arrivalTimer.current = setTimeout(async () => {
          // Re-check: maybe they clocked in during the 10 min
          const freshRecord = await getTodayRecord();
          if (!freshRecord) {
            sendNotification(
              '⏰ Pointage d\'arrivée',
              'Vous êtes connecté au réseau de l\'entreprise depuis 10 minutes sans avoir pointé votre arrivée. N\'oubliez pas !',
            );
            presenceState.current = 'reminded';
          }
        }, ARRIVAL_REMINDER_DELAY);
      } else if (hasClockedIn && !hasClockedOut) {
        presenceState.current = 'on-site';
      }
    } else {
      // ─── User is NOT on the office WiFi ───
      if (arrivalTimer.current) {
        // Left before the 10 min reminder → cancel it
        clearTimeout(arrivalTimer.current);
        arrivalTimer.current = null;
      }

      if (
        hasClockedIn &&
        !hasClockedOut &&
        presenceState.current === 'on-site' &&
        !departureTimer.current
      ) {
        // Was on-site, now gone, hasn't clocked out → start 20 min timer
        departureTimer.current = setTimeout(async () => {
          const freshRecord = await getTodayRecord();
          if (freshRecord && !freshRecord.clock_out) {
            // Auto clock-out
            await supabase
              .from('attendance')
              .update({ clock_out: new Date().toISOString() })
              .eq('id', freshRecord.id);

            sendNotification(
              '🚪 Départ automatique enregistré',
              'Vous avez quitté le réseau de l\'entreprise depuis 20 minutes sans pointer votre départ. Le système a enregistré votre sortie automatiquement.',
            );
          }
          presenceState.current = 'away';
          departureTimer.current = null;
        }, DEPARTURE_AUTO_DELAY);
      } else if (!hasClockedIn) {
        presenceState.current = 'away';
      }
    }
  }, [user, getTodayRecord, sendNotification, clearTimers]);

  useEffect(() => {
    if (!user) return;

    // Load office IP once
    const loadSettings = async () => {
      const { data: settings } = await supabase.from('app_settings').select('*');
      if (settings) {
        const ipSetting = settings.find((s) => s.key === 'office_ip');
        if (ipSetting) {
          officeIp.current = String(ipSetting.value).replace(/"/g, '');
        }
      }
    };

    loadSettings().then(() => {
      // Initial check
      checkPresence();
    });

    // Periodic IP check
    const interval = setInterval(checkPresence, IP_CHECK_INTERVAL);

    return () => {
      clearInterval(interval);
      clearTimers();
    };
  }, [user, role, checkPresence, clearTimers]);
}
