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
  const officeLat = useRef<number | null>(null);
  const officeLng = useRef<number | null>(null);
  const officeRadius = useRef<number>(100);
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
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Check for open overnight record from yesterday first
    const { data: overnight } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_id', user.id)
      .gte('clock_in', yesterday)
      .lt('clock_in', today)
      .is('clock_out', null)
      .limit(1);
    if (overnight && overnight.length > 0) return overnight[0];

    // Then check today's record
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

  // Haversine distance in meters
  const haversineDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, []);

  // Get GPS position as a promise
  const getGpsPosition = useCallback((): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    });
  }, []);

  const checkPresence = useCallback(async () => {
    if (!user) return;

    const hasGps = officeLat.current !== null && officeLng.current !== null;
    const hasIps = officeIps.current.length > 0 && !(officeIps.current.length === 1 && officeIps.current[0] === '0.0.0.0');

    if (!hasGps && !hasIps) return;

    let isOnSite = false;
    let currentIp = '';

    // Primary: GPS check
    if (hasGps) {
      const pos = await getGpsPosition();
      if (pos) {
        const dist = haversineDistance(pos.lat, pos.lng, officeLat.current!, officeLng.current!);
        isOnSite = dist <= officeRadius.current;
      }
    }

    // Fallback: IP check (only if GPS not configured or GPS said off-site)
    if (!isOnSite && hasIps) {
      try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        currentIp = data.ip;
      } catch {
        // network error → skip this cycle if no GPS match
        if (!hasGps) return;
      }

      if (currentIp) {
        isOnSite = officeIps.current.some(ip => {
          if (!ip || ip === '0.0.0.0') return false;
          // Compare only the first 3 octets (X.X.X.*) — the 4th changes frequently on WiFi
          const ipParts = ip.split('.');
          const currentParts = currentIp.split('.');
          if (ipParts.length === 4 && currentParts.length === 4) {
            return ipParts.slice(0, 3).every((seg, i) => seg === '*' || seg === currentParts[i]);
          }
          return currentIp === ip;
        });
      }
    }

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
        } else {
          // Notify on failure (e.g. duplicate entry)
          console.warn('Auto clock-in failed:', error.message);
          if (!error.message.includes('existe déjà')) {
            sendNotification('⚠️ Erreur de pointage', `Le pointage automatique a échoué : ${error.message}`);
          }
        }
      } else if (hasClockedIn && !hasClockedOut) {
        presenceState.current = 'on-site';
      }
    } else {
      // ─── User is NOT on the office network ───
      if (hasClockedIn && !hasClockedOut) {
        // User has an open attendance record and is off-site

        // Calculate how long they've been off-site
        // Use lastSeenOnSite if available, otherwise use clock_in time as reference
        const lastOnSiteTime = lastSeenOnSite.current
          ? new Date(lastSeenOnSite.current).getTime()
          : new Date(record!.clock_in).getTime();
        const elapsed = Date.now() - lastOnSiteTime;

        if (elapsed >= DEPARTURE_AUTO_DELAY) {
          // Already past 1h15 → auto clock-out immediately
          if (departureTimer.current) {
            clearTimeout(departureTimer.current);
            departureTimer.current = null;
          }
          const departureTimestamp = lastSeenOnSite.current || record!.clock_in;
          await supabase
            .from('attendance')
            .update({ clock_out: departureTimestamp })
            .eq('id', record!.id);

          sendNotification(
            '🚪 Départ automatique enregistré',
            'Vous avez quitté le réseau de l\'entreprise depuis plus de 1h15. Le système a enregistré votre sortie.',
          );
          presenceState.current = 'away';
        } else if (!departureTimer.current) {
          // Start a timer for the remaining time
          const remaining = DEPARTURE_AUTO_DELAY - elapsed;
          const departureTimestamp = lastSeenOnSite.current || new Date().toISOString();
          presenceState.current = 'on-site'; // ensure state is correct for next cycle
          departureTimer.current = setTimeout(async () => {
            const freshRecord = await getTodayRecord();
            if (freshRecord && !freshRecord.clock_out) {
              await supabase
                .from('attendance')
                .update({ clock_out: departureTimestamp })
                .eq('id', freshRecord.id);

              sendNotification(
                '🚪 Départ automatique enregistré',
                'Vous avez quitté le réseau de l\'entreprise depuis 1h15 sans pointer votre départ. Le système a enregistré votre sortie.',
              );
            }
            presenceState.current = 'away';
            departureTimer.current = null;
          }, remaining);
        }
      } else if (!hasClockedIn) {
        presenceState.current = 'away';
      }
    }
  }, [user, getTodayRecord, sendNotification, clearTimers]);

  useEffect(() => {
    if (!user || role === 'admin') return; // Admins don't need auto presence detection

    // Load office IP once
    const loadSettings = async () => {
      const { data: settings } = await supabase.from('app_settings').select('*');
      if (settings) {
        const ipSetting = settings.find((s) => s.key === 'office_ip');
        if (ipSetting) {
          officeIps.current = String(ipSetting.value).replace(/"/g, '').split(',').map(s => s.trim()).filter(Boolean);
        }
        const latSetting = settings.find((s) => s.key === 'office_lat');
        const lngSetting = settings.find((s) => s.key === 'office_lng');
        const radSetting = settings.find((s) => s.key === 'office_radius');
        const lat = parseFloat(String(latSetting?.value ?? '').replace(/"/g, ''));
        const lng = parseFloat(String(lngSetting?.value ?? '').replace(/"/g, ''));
        const rad = parseFloat(String(radSetting?.value ?? '100').replace(/"/g, ''));
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
          officeLat.current = lat;
          officeLng.current = lng;
          officeRadius.current = isNaN(rad) ? 100 : rad;
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
