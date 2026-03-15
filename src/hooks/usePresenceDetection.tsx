import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

// Intervals
const IP_CHECK_INTERVAL = 2 * 60 * 1000;   // Check IP every 2 min
const DEPARTURE_AUTO_DELAY = 75 * 60 * 1000;   // 1h15 after WiFi lost

type PresenceState = 'away' | 'on-site' | 'reminded';

export function usePresenceDetection() {
  const { user, role } = useAuth();
  const { toast } = useToast();

  const presenceState = useRef<PresenceState>('away');
  const departureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const officeIps = useRef<string[]>([]);
  const notifPermission = useRef<NotificationPermission>('default');
  const lastSeenOnSite = useRef<string | null>(null);

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
    if (departureTimer.current) {
      clearTimeout(departureTimer.current);
      departureTimer.current = null;
    }
  }, []);

  const checkPresence = useCallback(async () => {
    if (!user || !officeIps.current.length || (officeIps.current.length === 1 && officeIps.current[0] === '0.0.0.0')) return;

    // Fetch current IP
    let currentIp = '';
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      currentIp = data.ip;
    } catch {
      return; // network error → skip this cycle
    }

    const isOnSite = officeIps.current.some(ip => {
      if (!ip || ip === '0.0.0.0') return false;
      if (ip.includes('*')) {
        return new RegExp('^' + ip.split('.').map(seg => seg === '*' ? '\\d+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\.') + '$').test(currentIp);
      }
      return currentIp === ip;
    });
    const record = await getTodayRecord();
    const hasClockedIn = !!record;
    const hasClockedOut = !!record?.clock_out;

    if (isOnSite) {
      // ─── User is on the office WiFi ───
      lastSeenOnSite.current = new Date().toISOString();

      if (departureTimer.current) {
        // They came back before 1h15 → cancel departure
        clearTimeout(departureTimer.current);
        departureTimer.current = null;
      }

      if (!hasClockedIn && presenceState.current === 'away') {
        // Vient d'arriver sur le WiFi, pas encore pointé → pointage automatique
        presenceState.current = 'on-site';
        const now = new Date();

        // Déterminer le statut (retard ou présent) selon l'horaire de travail
        let status = 'present';
        try {
          const { data: schedData } = await supabase
            .from('employee_schedules')
            .select('schedule')
            .eq('user_id', user.id)
            .maybeSingle();

          let startTime = '08:00';
          if (schedData?.schedule) {
            const joursFr = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
            const todayName = joursFr[now.getDay()];
            const sched = schedData.schedule as Record<string, { start: string; end: string } | null>;
            if (sched[todayName]?.start) startTime = sched[todayName]!.start;
          } else {
            const { data: settings } = await supabase.from('app_settings').select('*');
            const wst = settings?.find((s) => s.key === 'work_start_time');
            if (wst) startTime = String(wst.value).replace(/"/g, '');
          }

          const [startH, startM] = startTime.split(':').map(Number);
          const startDate = new Date(now);
          startDate.setHours(startH, startM, 0, 0);
          if (now > startDate) status = 'late';
        } catch {
          // En cas d'erreur, on pointe quand même comme "present"
        }

        const { error } = await supabase
          .from('attendance')
          .insert({
            user_id: user.id,
            ip_address: currentIp,
            status,
          });

        if (!error) {
          sendNotification(
            status === 'late' ? '⚠️ Arrivée en retard (auto)' : '✅ Arrivée automatique enregistrée',
            `Votre appareil a été détecté sur le réseau de l'entreprise. Pointage d'arrivée enregistré à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`,
          );
        }
      } else if (hasClockedIn && !hasClockedOut) {
        presenceState.current = 'on-site';
      }
    } else {
      // ─── User is NOT on the office WiFi ───
      if (
        hasClockedIn &&
        !hasClockedOut &&
        presenceState.current === 'on-site' &&
        !departureTimer.current
      ) {
        // Was on-site, now gone, hasn't clocked out → start 1h15 timer
        const departureTimestamp = lastSeenOnSite.current || new Date().toISOString();
        departureTimer.current = setTimeout(async () => {
          const freshRecord = await getTodayRecord();
          if (freshRecord && !freshRecord.clock_out) {
            // Auto clock-out avec l'heure du dernier signalement sur site
            await supabase
              .from('attendance')
              .update({ clock_out: departureTimestamp })
              .eq('id', freshRecord.id);

            sendNotification(
              '🚪 Départ automatique enregistré',
              'Vous avez quitté le réseau de l\'entreprise depuis 1h15 sans pointer votre départ. Le système a enregistré votre sortie à l\'heure de votre dernier signalement.',
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
          officeIps.current = String(ipSetting.value).replace(/"/g, '').split(',').map(s => s.trim()).filter(Boolean);
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
