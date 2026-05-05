"use client";

// Persistent sidebar shell wrapping every authenticated route. Matches the
// reference UI: sage Balance wordmark top-left, 7-item nav with sage-tint
// pill on the active route, soft footer note. Mobile collapses to a top bar.

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ClipboardList,
  Dumbbell,
  Home as HomeIcon,
  LineChart,
  Menu,
  ScanLine,
  User,
  Users,
  X,
} from "lucide-react";
import { loadDraft } from "@/lib/onboarding/persist";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  // Active path matcher (startsWith). Defaults to exact href match.
  matchPrefix?: string;
};

const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: <HomeIcon size={17} strokeWidth={1.5} /> },
  {
    href: "/scan",
    label: "Check-in",
    icon: <ScanLine size={17} strokeWidth={1.5} />,
  },
  {
    href: "/library",
    label: "Exercises",
    icon: <Dumbbell size={17} strokeWidth={1.5} />,
    matchPrefix: "/library",
  },
  {
    href: "/monthly",
    label: "Monthly test",
    icon: <ClipboardList size={17} strokeWidth={1.5} />,
  },
  {
    href: "/progress",
    label: "Progress",
    icon: <LineChart size={17} strokeWidth={1.5} />,
  },
  {
    href: "/care-team",
    label: "Care team",
    icon: <Users size={17} strokeWidth={1.5} />,
  },
  {
    href: "/profile",
    label: "Profile",
    icon: <User size={17} strokeWidth={1.5} />,
  },
];

interface AppShellProps {
  children: ReactNode;
  // True for routes that need a completed profile (most routes). False for
  // /onboarding/* — already at the gate.
  requireProfile?: boolean;
}

export function AppShell({ children, requireProfile = true }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  // Profile gate — redirect to onboarding if no profile draft on this device.
  // Runs client-side because localStorage isn't available server-side.
  useEffect(() => {
    if (!requireProfile) {
      setProfileChecked(true);
      return;
    }
    const draft = loadDraft();
    const ok = !!draft && !!draft.curveType;
    setHasProfile(ok);
    setProfileChecked(true);
    if (!ok) {
      router.replace("/onboarding");
    }
  }, [requireProfile, router]);

  // Close the mobile drawer when path changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (requireProfile && !profileChecked) {
    return (
      <div className="grid min-h-screen place-items-center bg-base">
        <p className="text-[13px] text-ink-tertiary">Loading…</p>
      </div>
    );
  }
  if (requireProfile && !hasProfile) {
    return (
      <div className="grid min-h-screen place-items-center bg-base px-6 text-center">
        <p className="text-[14px] text-ink-secondary">
          Setting things up…
        </p>
      </div>
    );
  }

  const isActive = (item: NavItem) => {
    if (item.matchPrefix) return pathname.startsWith(item.matchPrefix);
    if (item.href === "/") return pathname === "/";
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  return (
    <div className="flex min-h-screen bg-base">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-60 shrink-0 flex-col border-r border-border/60 bg-base px-6 py-9">
        <Link
          href="/"
          className="font-display text-[22px] text-sage-dark hover:opacity-80 transition-opacity"
        >
          Balance
        </Link>
        <nav className="mt-9 flex flex-col gap-1 text-[15px]">
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item)} />
          ))}
        </nav>
        <p className="mt-auto pt-12 text-[12px] text-ink-tertiary">
          Works alongside your care team.
        </p>
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="lg:hidden fixed inset-x-0 top-0 z-40 flex items-center justify-between bg-base/85 backdrop-blur-sm px-4 py-3 border-b border-border/60">
        <Link
          href="/"
          className="font-display text-[20px] text-sage-dark"
        >
          Balance
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary hover:bg-sage-wash"
          aria-label="Open menu"
        >
          <Menu size={18} strokeWidth={1.6} />
        </button>
      </div>

      {mobileOpen ? (
        <div className="lg:hidden fixed inset-0 z-50 bg-ink-primary/40 backdrop-blur-sm">
          <aside className="absolute left-0 top-0 h-full w-[80%] max-w-sm bg-base p-6 shadow-card-lift">
            <div className="flex items-center justify-between">
              <Link
                href="/"
                className="font-display text-[22px] text-sage-dark"
              >
                Balance
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary hover:bg-sage-wash"
                aria-label="Close menu"
              >
                <X size={18} strokeWidth={1.6} />
              </button>
            </div>
            <nav className="mt-7 flex flex-col gap-1 text-[15px]">
              {NAV.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item)} />
              ))}
            </nav>
            <p className="mt-auto pt-12 text-[12px] text-ink-tertiary">
              Works alongside your care team.
            </p>
          </aside>
        </div>
      ) : null}

      {/* Main content area */}
      <div className="flex-1 lg:pl-0 pt-14 lg:pt-0">{children}</div>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={
        "flex items-center gap-3 rounded-full px-4 py-2.5 transition-colors " +
        (active
          ? "bg-sage-tint text-sage-dark"
          : "text-ink-secondary hover:bg-sage-wash hover:text-ink-primary")
      }
    >
      <span>{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  );
}
