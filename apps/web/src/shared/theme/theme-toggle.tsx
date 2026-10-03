import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/cn";
import type { ThemePreference } from "./theme";
import { useTheme } from "./theme-context";
import styles from "./theme-toggle.module.css";

const themeOptions: {
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset
      aria-label="Theme preference"
      className={cn(styles.group, className)}
    >
      <legend className={styles.srOnly}>Theme preference</legend>
      {themeOptions.map(({ value, label, icon: Icon }) => {
        const isSelected = preference === value;
        return (
          <button
            aria-label={`${label} theme`}
            aria-pressed={isSelected}
            className={cn(styles.button, isSelected && styles.active)}
            key={value}
            onClick={() => setPreference(value)}
            title={`${label} theme`}
            type="button"
          >
            <Icon aria-hidden="true" className={styles.icon} />
          </button>
        );
      })}
    </fieldset>
  );
}

export function ThemeDropdownItems() {
  const { preference, setPreference } = useTheme();

  return (
    <>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      {themeOptions.map(({ value, label, icon: Icon }) => (
        <DropdownMenuItem key={value} onSelect={() => setPreference(value)}>
          <Icon aria-hidden="true" style={{ width: "1rem", height: "1rem" }} />
          <span>{label}</span>
          {preference === value ? (
            <Check
              aria-hidden="true"
              style={{
                width: "1rem",
                height: "1rem",
                marginLeft: "auto",
                color: "var(--color-primary)",
              }}
            />
          ) : null}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
    </>
  );
}
