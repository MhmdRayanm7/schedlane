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
        <section className="w-full max-w-[400px] rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          <header className="mb-5">
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
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
