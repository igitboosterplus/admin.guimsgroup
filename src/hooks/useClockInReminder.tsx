import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Sends a browser notification reminder if the employee hasn't clocked in
 * after the configured start time. Works even without periodic background sync.
 * Fires once per session when the app is open.
 */
export function useClockInReminder() {
  const { user, role } = useAuth();
  const reminded = useRef(false);

  useEffect(() => {
    if (!user || role === 'admin' || reminded.current) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const check = async () => {
      // Load work start time
      const { data: settings } = await supabase.from('app_settings').select('*');
      const wst = settings?.find((s) => s.key === 'work_start_time');
      const startTime = wst ? String(wst.value).replace(/"/g, '') : '08:00';
      const [startH, startM] = startTime.split(':').map(Number);

      const now = new Date();
      const day = now.getDay();
      if (day === 0 || day === 6) return; // Skip weekends

      // Only remind if past start time + 15min grace
      const startMinutes = startH * 60 + startM + 15;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (nowMinutes < startMinutes || nowMinutes > startMinutes + 120) return;

      // Check if already clocked in today
      const today = now.toISOString().split('T')[0];
      const { data } = await supabase
        .from('attendance')
        .select('id')
        .eq('user_id', user.id)
        .gte('clock_in', today)
        .limit(1);

      if (data && data.length > 0) return; // Already clocked in

      reminded.current = true;

      // Show browser notification
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_REMINDER',
        });
      }
      // Also show direct notification as fallback
      new Notification('⏰ Rappel de pointage', {
        body: `Il est ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — Vous n'avez pas encore pointé votre arrivée.`,
        icon: '/logos/guims group.jpg',
        tag: 'clock-in-reminder',
      });
    };

    // Wait 10 seconds after mount, then check
    const timer = setTimeout(check, 10_000);
    return () => clearTimeout(timer);
  }, [user, role]);
}
