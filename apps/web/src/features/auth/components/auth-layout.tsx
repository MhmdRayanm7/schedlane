import type { ReactNode } from "react";
import { BrandLockup } from "@/shared/brand/brand-lockup";

type AuthLayoutProps = {
  children: ReactNode;
  description: string;
  title: string;
};

export function AuthLayout({ children, description, title }: AuthLayoutProps) {
  return (
    <main className="flex min-h-dvh flex-col bg-background px-5 py-8 sm:px-8">
      <BrandLockup className="mx-auto sm:mx-0" />
      <div className="flex flex-1 items-center justify-center py-10">
        <section className="w-full max-w-[400px] rounded-xl border border-border bg-surface p-6 shadow-[0_16px_45px_rgba(24,27,27,0.06)] sm:p-8">
          <header className="mb-7">
            <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-foreground">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}
