import type { ReactNode } from "react";
import { BrandLockup } from "@/shared/brand/brand-lockup";
import styles from "../auth.module.css";

type AuthLayoutProps = {
  children: ReactNode;
  description: string;
  title: string;
};

export function AuthLayout({ children, description, title }: AuthLayoutProps) {
  return (
    <main className={styles.layout}>
      <BrandLockup className={styles.brand} />
      <div className={styles.layoutContent}>
        <section className={styles.card}>
          <header className={styles.header}>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.description}>{description}</p>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}
