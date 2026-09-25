import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  type LucideIcon,
  Menu,
  PackageOpen,
  Settings,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useParams } from "react-router";
import { BrandLockup } from "@/shared/brand/brand-lockup";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/cn";

type NavigationItem = {
  label: string;
  path: string;
  icon: LucideIcon;
};

const primaryNavigation: NavigationItem[] = [
  { label: "Bookings", path: "bookings", icon: CalendarDays },
  { label: "Services", path: "services", icon: BookOpen },
  { label: "Resources", path: "resources", icon: PackageOpen },
  { label: "Schedule", path: "schedule", icon: SlidersHorizontal },
  { label: "Team", path: "team", icon: Users },
];

const settingsNavigation: NavigationItem[] = [
  { label: "Settings", path: "settings", icon: Settings },
];

type SidebarProps = {
  id: string;
  organizationId: string;
  onNavigate?: () => void;
  onClose?: () => void;
};

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
      to={`/app/${organizationId}/${item.path}`}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-[#eef1f0] hover:text-foreground",
          isActive && "bg-primary-subtle text-primary",
        )
      }
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

function Sidebar({ id, organizationId, onNavigate, onClose }: SidebarProps) {
  return (
    <aside
      id={id}
      className="flex h-full w-[232px] shrink-0 flex-col border-r border-border bg-[#fafbfb]"
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
        <Button
          aria-label="Select organization"
          className="h-auto w-full justify-between border-border bg-surface px-3 py-2.5 text-left"
          variant="outline"
        >
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-foreground">
              Schedlane Demo Barbers
            </span>
            <span className="mt-0.5 block text-xs font-normal text-subtle-foreground">
              Organization
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-subtle-foreground"
          />
        </Button>
      </div>

      <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col px-3">
        <div className="space-y-1">
          {primaryNavigation.map((item) => (
            <NavigationLink
              item={item}
              key={item.path}
              onNavigate={onNavigate}
              organizationId={organizationId}
            />
          ))}
        </div>
        <div className="mt-auto border-t border-border py-3">
          {settingsNavigation.map((item) => (
            <NavigationLink
              item={item}
              key={item.path}
              onNavigate={onNavigate}
              organizationId={organizationId}
            />
          ))}
        </div>
      </nav>

      <div className="border-t border-border p-3">
        <button
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-150 hover:bg-[#eef1f0]"
          type="button"
        >
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e2e7e6] text-xs font-semibold text-foreground"
          >
            DR
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-foreground">
              Demo User
            </span>
            <span className="block truncate text-xs text-subtle-foreground">
              Account
            </span>
          </span>
        </button>
      </div>
    </aside>
  );
}

export function AdminShell() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  useEffect(() => {
    if (!mobileNavigationOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavigationOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavigationOpen]);

  if (!organizationId) return null;

  return (
    <div className="flex min-h-dvh bg-background">
      <div className="fixed inset-y-0 left-0 hidden lg:block">
        <Sidebar id="desktop-navigation" organizationId={organizationId} />
      </div>

      {mobileNavigationOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-[#181b1b]/25"
            onClick={() => setMobileNavigationOpen(false)}
            type="button"
          />
          <div className="relative h-full w-[232px] animate-[sidebar-in_180ms_ease-out]">
            <Sidebar
              id="mobile-navigation"
              onClose={() => setMobileNavigationOpen(false)}
              onNavigate={() => setMobileNavigationOpen(false)}
              organizationId={organizationId}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col lg:pl-[232px]">
        <header className="flex h-14 items-center border-b border-border bg-surface px-4 lg:hidden">
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
          <BrandLockup
            className="ml-2 gap-1.5"
            markClassName="size-[21px]"
            wordmarkClassName="text-[15px]"
          />
        </header>

        <main className="flex-1 px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12 xl:px-16">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
