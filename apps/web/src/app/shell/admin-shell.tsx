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
        cn(
          "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-surface-hover hover:text-foreground",
          isActive &&
            "border-l-2 border-primary bg-primary-subtle font-semibold text-primary",
        )
      }
      onClick={onNavigate}
      to={`/app/${organizationId}/${item.path}`}
    >
      <Icon
        aria-hidden="true"
        className="size-[18px] shrink-0"
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
    <aside
      className="flex h-full w-[232px] shrink-0 flex-col border-r border-border bg-surface"
      id={id}
    >
      <div className="flex h-16 items-center justify-between px-5">
        <BrandLockup />
        {onClose ? (
          <Button
            aria-label="Close navigation"
            className="-mr-2"
            onClick={onClose}
            size="icon"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-5" />
          </Button>
        ) : null}
      </div>

      <div className="px-3 pb-5 pt-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Select organization. Current organization: ${currentOrganization.name}`}
              className="h-auto w-full justify-between border-border bg-surface px-3 py-2.5 text-left"
              variant="outline"
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-foreground">
                  {currentOrganization.name}
                </span>
                <span className="mt-0.5 block text-xs font-normal text-subtle-foreground">
                  {roleLabel(currentOrganization.role)}
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 text-subtle-foreground"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[208px]">
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            {organizations.map((organization) => (
              <DropdownMenuItem
                className="justify-between"
                key={organization.id}
                onSelect={() => selectOrganization(organization)}
              >
                <span className="min-w-0">
                  <span className="block [overflow-wrap:anywhere]">
                    {organization.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {roleLabel(organization.role)}
                  </span>
                </span>
                {organization.id === currentOrganization.id ? (
                  <Check
                    aria-hidden="true"
                    className="size-4 shrink-0 text-primary"
                  />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav
        aria-label="Primary"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3"
      >
        <div className="space-y-1">
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
          <div className="mt-auto border-t border-border py-3">
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

      <div className="border-t border-border p-3">
        {session ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-hover"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-border text-xs font-semibold text-foreground"
                >
                  {userInitials(session.user.name, session.user.email)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-foreground">
                    {session.user.name}
                  </span>
                  <span className="block truncate text-xs text-subtle-foreground">
                    {session.user.email}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="ml-auto size-4 shrink-0 text-subtle-foreground"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[208px]" side="top">
              <DropdownMenuLabel className="[overflow-wrap:anywhere]">
                {session.user.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void signOut()}>
                <LogOut aria-hidden="true" className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {signOutError ? (
          <p
            className="mt-2 px-3 text-xs leading-5 text-destructive"
            role="alert"
          >
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
      <div className="flex min-h-dvh bg-background">
        <div className="fixed inset-y-0 left-0 hidden lg:block">
          <Sidebar id="desktop-navigation" {...organizationAccess} />
        </div>

        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25 data-[state=closed]:animate-[sheet-overlay-out_150ms_ease-in] data-[state=open]:animate-[sheet-overlay-in_180ms_ease-out]" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 w-[232px] outline-none data-[state=closed]:animate-[sidebar-out_150ms_ease-in] data-[state=open]:animate-[sidebar-in_190ms_ease-out]"
          >
            <DialogPrimitive.Title className="sr-only">
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

        <div className="flex min-h-dvh min-w-0 flex-1 flex-col lg:pl-[232px]">
          <header className="flex h-14 items-center border-b border-border bg-surface px-4 lg:hidden">
            <DialogPrimitive.Trigger asChild>
              <Button
                aria-controls="mobile-navigation"
                aria-expanded={mobileNavigationOpen}
                aria-label="Open navigation"
                className="-ml-2"
                onClick={() => setMobileNavigationOpen(true)}
                size="icon"
                variant="ghost"
              >
                <Menu aria-hidden="true" className="size-5" />
              </Button>
            </DialogPrimitive.Trigger>
            <BrandLockup
              className="ml-2 gap-1.5"
              markClassName="size-[21px]"
              wordmarkClassName="text-[15px]"
            />
          </header>

          {lifecycleMessage ? (
            <div
              className="border-b border-warning/25 bg-warning-subtle px-5 py-2.5 text-sm text-warning sm:px-6 lg:px-8"
              role="status"
            >
              {lifecycleMessage}
            </div>
          ) : null}

          <main className="mx-auto w-full max-w-[1440px] min-w-0 [overflow-wrap:anywhere] flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <Outlet context={organizationAccess} />
          </main>
        </div>
      </div>
    </DialogPrimitive.Root>
  );
}
