import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  LogOut,
  type LucideIcon,
  Menu,
  PackageOpen,
  Settings,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
} from "react-router";
import type { OrganizationAccessContext } from "@/features/organizations/components/organization-route-states";
import type { Organization } from "@/features/organizations/types";
import { authClient } from "@/shared/auth/auth-client";
import { BrandLockup } from "@/shared/brand/brand-lockup";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/cn";
import styles from "./admin-shell.module.css";

type NavigationItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  staffVisible: boolean;
};

const primaryNavigation: NavigationItem[] = [
  {
    label: "Bookings",
    path: "bookings",
    icon: CalendarDays,
    staffVisible: true,
  },
  {
    label: "Services",
    path: "services",
    icon: BookOpen,
    staffVisible: false,
  },
  {
    label: "Resources",
    path: "resources",
    icon: PackageOpen,
    staffVisible: false,
  },
  {
    label: "Schedule",
    path: "schedule",
    icon: SlidersHorizontal,
    staffVisible: false,
  },
  { label: "Team", path: "team", icon: Users, staffVisible: true },
];

const settingsNavigation: NavigationItem[] = [
  {
    label: "Settings",
    path: "settings",
    icon: Settings,
    staffVisible: false,
  },
];

const adminSections = new Set([
  "bookings",
  "services",
  "resources",
  "schedule",
  "team",
  "settings",
]);

function roleLabel(role: Organization["role"]) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function userInitials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 0) {
    return parts
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  return email.slice(0, 2).toUpperCase();
}

function NavigationLink({
  item,
  organizationId,
  onNavigate,
}: {
  item: NavigationItem;
  organizationId: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <NavLink
      className={({ isActive }) =>
        cn(styles.navigationLink, isActive && styles.navigationLinkActive)
      }
      onClick={onNavigate}
      to={`/app/${organizationId}/${item.path}`}
    >
      <Icon
        aria-hidden="true"
        className={styles.navigationIcon}
        strokeWidth={1.8}
      />
      <span>{item.label}</span>
    </NavLink>
  );
}

type SidebarProps = OrganizationAccessContext & {
  id: string;
  onClose?: () => void;
  onNavigate?: () => void;
};

function Sidebar({
  currentOrganization,
  id,
  onClose,
  onNavigate,
  organizations,
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const [signOutError, setSignOutError] = useState(false);
  const isStaff = currentOrganization.role === "staff";
  const visiblePrimaryNavigation = primaryNavigation.filter(
    (item) => !isStaff || item.staffVisible,
  );
  const visibleSettingsNavigation = settingsNavigation.filter(
    (item) => !isStaff || item.staffVisible,
  );
  const currentSection = location.pathname.split("/").filter(Boolean)[2];

  function selectOrganization(organization: Organization) {
    const section =
      currentSection &&
      adminSections.has(currentSection) &&
      (organization.role !== "staff" ||
        primaryNavigation.some(
          (item) => item.path === currentSection && item.staffVisible,
        ))
        ? currentSection
        : "bookings";

    onNavigate?.();
    navigate(`/app/${organization.id}/${section}`);
  }

  async function signOut() {
    setSignOutError(false);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setSignOutError(true);
        return;
      }

      await refetchSession();
      queryClient.clear();
      navigate("/login", { replace: true, state: { signedOut: true } });
    } catch {
      setSignOutError(true);
    }
  }

  return (
    <aside className={styles.sidebar} id={id}>
      <div className={styles.brandArea}>
        <BrandLockup />
        {onClose ? (
          <Button
            aria-label="Close navigation"
            className={styles.closeNavigation}
            onClick={onClose}
            size="icon"
            variant="ghost"
          >
            <X aria-hidden="true" className={styles.largeIcon} />
          </Button>
        ) : null}
      </div>

      <div className={styles.organizationSelector}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Select organization. Current organization: ${currentOrganization.name}`}
              className={styles.organizationButton}
              variant="outline"
            >
              <span className={styles.organizationCopy}>
                <span className={styles.truncatedName}>
                  {currentOrganization.name}
                </span>
                <span className={styles.role}>
                  {roleLabel(currentOrganization.role)}
                </span>
              </span>
              <ChevronDown aria-hidden="true" className={styles.mutedIcon} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className={styles.menuWidth}>
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            {organizations.map((organization) => (
              <DropdownMenuItem
                className={styles.organizationOption}
                key={organization.id}
                onSelect={() => selectOrganization(organization)}
              >
                <span className={styles.organizationCopy}>
                  <span className={styles.wrappedName}>
                    {organization.name}
                  </span>
                  <span className={styles.optionRole}>
                    {roleLabel(organization.role)}
                  </span>
                </span>
                {organization.id === currentOrganization.id ? (
                  <Check aria-hidden="true" className={styles.selectedIcon} />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav aria-label="Primary" className={styles.navigation}>
        <div className={styles.navigationGroup}>
          {visiblePrimaryNavigation.map((item) => (
            <NavigationLink
              item={item}
              key={item.path}
              onNavigate={onNavigate}
              organizationId={currentOrganization.id}
            />
          ))}
        </div>
        {visibleSettingsNavigation.length > 0 ? (
          <div className={styles.settingsNavigation}>
            {visibleSettingsNavigation.map((item) => (
              <NavigationLink
                item={item}
                key={item.path}
                onNavigate={onNavigate}
                organizationId={currentOrganization.id}
              />
            ))}
          </div>
        ) : null}
      </nav>

      <div className={styles.accountArea}>
        {session ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={styles.accountButton} type="button">
                <span aria-hidden="true" className={styles.avatar}>
                  {userInitials(session.user.name, session.user.email)}
                </span>
                <span className={styles.accountCopy}>
                  <span className={styles.truncatedName}>
                    {session.user.name}
                  </span>
                  <span className={styles.email}>{session.user.email}</span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={styles.accountChevron}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className={styles.menuWidth}
              side="top"
            >
              <DropdownMenuLabel className={styles.wrappedName}>
                {session.user.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void signOut()}>
                <LogOut aria-hidden="true" className={styles.icon} />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {signOutError ? (
          <p className={styles.signOutError} role="alert">
            Sign out failed. Try again.
          </p>
        ) : null}
      </div>
    </aside>
  );
}

export function AdminShell() {
  const organizationAccess = useOutletContext<OrganizationAccessContext>();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  useEffect(() => {
    if (!mobileNavigationOpen) return;

    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileNavigationOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [mobileNavigationOpen]);

  const { currentOrganization } = organizationAccess;
  const lifecycleMessage = currentOrganization.archivedAt
    ? "This organization is archived."
    : currentOrganization.suspendedAt
      ? "This organization is suspended and is currently read-only."
      : null;

  return (
    <DialogPrimitive.Root
      open={mobileNavigationOpen}
      onOpenChange={setMobileNavigationOpen}
    >
      <div className={styles.shell}>
        <div className={styles.desktopSidebar}>
          <Sidebar id="desktop-navigation" {...organizationAccess} />
        </div>

        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className={styles.mobileOverlay} />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className={styles.mobileSidebar}
          >
            <DialogPrimitive.Title className={styles.visuallyHidden}>
              Navigation
            </DialogPrimitive.Title>
            <Sidebar
              id="mobile-navigation"
              onClose={() => setMobileNavigationOpen(false)}
              onNavigate={() => setMobileNavigationOpen(false)}
              {...organizationAccess}
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>

        <div className={styles.contentColumn}>
          <header className={styles.mobileHeader}>
            <DialogPrimitive.Trigger asChild>
              <Button
                aria-controls="mobile-navigation"
                aria-expanded={mobileNavigationOpen}
                aria-label="Open navigation"
                className={styles.openNavigation}
                onClick={() => setMobileNavigationOpen(true)}
                size="icon"
                variant="ghost"
              >
                <Menu aria-hidden="true" className={styles.largeIcon} />
              </Button>
            </DialogPrimitive.Trigger>
            <BrandLockup
              className={styles.mobileBrand}
              markClassName={styles.mobileBrandMark}
              wordmarkClassName={styles.mobileWordmark}
            />
          </header>

          {lifecycleMessage ? (
            <div className={styles.lifecycleBanner} role="status">
              {lifecycleMessage}
            </div>
          ) : null}

          <main className={styles.main}>
            <Outlet context={organizationAccess} />
          </main>
        </div>
      </div>
    </DialogPrimitive.Root>
  );
}
