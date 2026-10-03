import { Building2, ClipboardList, LogOut, Send } from "lucide-react";
import { NavLink, Outlet, useOutletContext } from "react-router";
import { useSignOut } from "@/features/auth/hooks/use-sign-out";
import { BrandLockup } from "@/shared/brand/brand-lockup";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/cn";
import { ThemeToggle } from "@/shared/theme/theme-toggle";
import styles from "./platform.module.css";
import type { PlatformIdentity } from "./types";

const navigation = [
  { to: "/platform/requests", label: "Requests", icon: ClipboardList },
  { to: "/platform/publications", label: "Publications", icon: Send },
  { to: "/platform/organizations", label: "Organizations", icon: Building2 },
];

export function PlatformShell() {
  const identity = useOutletContext<PlatformIdentity>();
  const signOut = useSignOut();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <BrandLockup />
        </div>
        <p className={styles.platformLabel}>Platform Admin</p>
        <nav className={styles.navigation} aria-label="Platform administration">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              className={({ isActive }) =>
                cn(styles.navLink, isActive && styles.navLinkActive)
              }
              key={to}
              to={to}
            >
              <Icon aria-hidden="true" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.account}>
          <div>
            <strong>{identity.name}</strong>
            <span>{identity.email}</span>
          </div>
          <ThemeToggle />
          <Button
            aria-label="Sign out"
            disabled={signOut.isPending}
            onClick={() => void signOut.signOut()}
            size="icon"
            variant="ghost"
          >
            <LogOut aria-hidden="true" />
          </Button>
        </div>
      </aside>
      <div className={styles.contentColumn}>
        <header className={styles.mobileHeader}>
          <BrandLockup />
          <div className={styles.mobileActions}>
            <nav aria-label="Platform administration">
              {navigation.map(({ to, label }) => (
                <NavLink key={to} to={to}>
                  {label}
                </NavLink>
              ))}
            </nav>
            <ThemeToggle />
          </div>
        </header>
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
