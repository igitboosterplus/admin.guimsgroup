import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions, Permission } from '@/hooks/usePermissions';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Clock,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Shield,
  UserCheck,
  CalendarDays,
  ClipboardList,
  CalendarClock,
  FolderOpen,
  User,
  Menu,
  X,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import guimsLogo from '@/assets/guims-logo.png';

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  permission?: Permission;
}

const navItems: NavItem[] = [
  { label: 'Tableau de bord', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Pointage', icon: Clock, path: '/attendance' },
  { label: 'Employés', icon: Users, path: '/employees', permission: 'employees.view' },
  { label: 'Rapports', icon: BarChart3, path: '/reports', permission: 'reports.view' },
  { label: 'Demandes', icon: CalendarDays, path: '/leaves' },
  { label: 'Tâches', icon: ClipboardList, path: '/tasks' },
  { label: 'Emplois du temps', icon: CalendarClock, path: '/schedules' },
  { label: 'Documents', icon: FolderOpen, path: '/documents' },
  { label: 'Approbations', icon: UserCheck, path: '/approvals', permission: 'approvals.manage' },
  { label: 'Paramètres', icon: Settings, path: '/settings', permission: 'settings.view' },
  { label: 'Droits d\'accès', icon: Shield, path: '/permissions', permission: 'permissions.manage' },
];

export default function AppSidebar() {
  const { profile, role, signOut } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const filteredItems = navItems.filter((item) =>
    !item.permission || can(item.permission)
  );

  const getRoleBadge = (role: string | null) => {
    const labels: Record<string, string> = {
      admin: 'Administrateur',
      manager: 'Manager/RH',
      bureau: 'Bureau',
      terrain: 'Terrain',
    };
    return labels[role || ''] || role;
  };

  const handleNav = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <img src={guimsLogo} alt="Guims Group" className="w-9 h-9" />
        <div>
          <h2 className="font-display text-sm font-bold text-sidebar-primary-foreground">GUIMS GROUP</h2>
          <p className="text-[10px] uppercase tracking-widest opacity-60">Gestion RH</p>
        </div>
        {/* Close button on mobile */}
        <button className="ml-auto lg:hidden" onClick={() => setMobileOpen(false)} title="Fermer le menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {filteredItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <button
              key={item.path}
              onClick={() => handleNav(item.path)}
              className={`sidebar-nav-item w-full text-left ${
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              }`}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User info */}
      <div className="border-t border-sidebar-border p-4 space-y-2">
        <button
          onClick={() => handleNav('/profile')}
          className={`sidebar-nav-item w-full text-left ${
            location.pathname === '/profile'
              ? 'bg-sidebar-accent text-sidebar-primary'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
          }`}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
            {profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{profile?.full_name}</p>
            <p className="text-[11px] text-sidebar-foreground/50">{getRoleBadge(role)}</p>
          </div>
        </button>
        <button
          onClick={() => setLogoutOpen(true)}
          className="sidebar-nav-item w-full text-left text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden rounded-md bg-background p-2 shadow-md border"
        onClick={() => setMobileOpen(true)}
        title="Ouvrir le menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border
        transition-transform duration-200 ease-in-out
        lg:static lg:translate-x-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {sidebarContent}
      </aside>

      {/* Logout confirmation */}
      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Se déconnecter ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir vous déconnecter de votre session ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={signOut} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Déconnexion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
