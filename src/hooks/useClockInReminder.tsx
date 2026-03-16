import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Plays an alarm sound + browser notification when the employee hasn't clocked in
 * at the configured work start time. Repeats every 5 minutes until clock-in or 2h after start.
 * Also reminds of the acceptable late margin (30 min grace).
 */
export function useClockInReminder() {
  const { user, role } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user || role === 'admin') return;
    if (!('Notification' in window)) return;

    // Request permission proactively
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const playAlarm = () => {
      try {
        const ctx = new AudioContext();
        // Play a triple-beep alarm
        [0, 0.25, 0.5].forEach(delay => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.value = 0.3;
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.15);
        });
      } catch {
        // AudioContext not available — silent fallback
      }
    };

    const check = async () => {
      // Load work start time
      const { data: settings } = await supabase.from('app_settings').select('*');
      const wst = settings?.find((s) => s.key === 'work_start_time');
      const startTime = wst ? String(wst.value).replace(/"/g, '') : '08:00';
      const [startH, startM] = startTime.split(':').map(Number);

      const now = new Date();
      const day = now.getDay();
      if (day === 0 || day === 6) return; // Skip weekends

      const startMinutes = startH * 60 + startM;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      // Only remind from start time up to 2h after
      if (nowMinutes < startMinutes || nowMinutes > startMinutes + 120) return;

      // Check if already clocked in today
      const today = now.toISOString().split('T')[0];
      const { data } = await supabase
        .from('attendance')
        .select('id')
        .eq('user_id', user.id)
        .gte('clock_in', today)
        .limit(1);

      if (data && data.length > 0) {
        // Already clocked in → stop checking
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }

      const lateMinutes = nowMinutes - startMinutes;
      const graceMinutes = 30;

      playAlarm();

      if (Notification.permission === 'granted') {
        const body = lateMinutes <= 0
          ? `Il est ${startTime} — c'est l'heure de pointer ! Marge de tolérance : ${graceMinutes} min.`
          : lateMinutes <= graceMinutes
            ? `Vous avez ${graceMinutes - lateMinutes} min de marge restante avant d'être compté en retard. Pointez maintenant !`
            : `⚠️ Vous êtes en retard de ${lateMinutes} min ! Pénalité : 1% du salaire par heure de retard (max 4%/jour).`;

        // SW notification
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'SHOW_REMINDER' });
        }
        new Notification('⏰ Rappel de pointage', {
          body,
          icon: '/logos/guims group.jpg',
          tag: 'clock-in-reminder',
          requireInteraction: true,
        });
      }
    };

    // First check after 10s, then every 5 minutes
    const timer = setTimeout(() => {
      check();
      intervalRef.current = setInterval(check, 5 * 60 * 1000);
    }, 10_000);

    return () => {
      clearTimeout(timer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, role]);
}
