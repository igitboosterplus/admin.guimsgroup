import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Browser notifications for tasks due today or tomorrow.
 * Checks every 30 minutes. Only notifies employees (not admins).
 */
export function useTaskReminders() {
  const { user, role } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const check = async () => {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      // Fetch tasks assigned to user that are not completed and due today or tomorrow
      let query = supabase
        .from('tasks')
        .select('id, title, due_date, status, priority')
        .in('due_date', [todayStr, tomorrowStr])
        .neq('status', 'completed');

      if (role !== 'admin' && role !== 'manager') {
        query = query.eq('assigned_to', user.id);
      }

      const { data: tasks } = await query;
      if (!tasks || tasks.length === 0) return;

      if (Notification.permission !== 'granted') return;

      const dueToday = tasks.filter((t) => t.due_date === todayStr);
      const dueTomorrow = tasks.filter((t) => t.due_date === tomorrowStr);

      // Notify for tasks due today (not already notified this session)
      for (const task of dueToday) {
        const key = `today-${task.id}`;
        if (notifiedRef.current.has(key)) continue;
        notifiedRef.current.add(key);
        const urgency = task.priority === 'urgent' ? '🔴 URGENT — ' : task.priority === 'high' ? '🟠 ' : '';
        new Notification('📋 Tâche à terminer aujourd\'hui', {
          body: `${urgency}${task.title}`,
          icon: '/logos/guims group.jpg',
          tag: `task-due-${task.id}`,
        });
      }

      // Notify for tasks due tomorrow (once per session)
      if (dueTomorrow.length > 0) {
        const key = `tomorrow-batch-${tomorrowStr}`;
        if (!notifiedRef.current.has(key)) {
          notifiedRef.current.add(key);
          new Notification(`📅 ${dueTomorrow.length} tâche(s) dues demain`, {
            body: dueTomorrow.map((t) => t.title).slice(0, 3).join(', ') + (dueTomorrow.length > 3 ? '...' : ''),
            icon: '/logos/guims group.jpg',
            tag: `task-due-tomorrow`,
          });
        }
      }
    };

    const timer = setTimeout(() => {
      check();
      intervalRef.current = setInterval(check, 30 * 60 * 1000); // Every 30 minutes
    }, 15_000); // First check after 15s

    return () => {
      clearTimeout(timer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, role]);
}
