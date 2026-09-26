import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

function SelectTrigger({
  children,
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex items-center justify-between gap-2",
        "[&>span:first-child]:truncate [&>span:first-child]:min-w-0",
        "h-10 min-w-0 w-full px-3",
        "rounded-md border border-border-strong bg-surface",
        "text-sm text-foreground",
        "outline-none transition-colors duration-150",
        "enabled:hover:border-muted-foreground",
        "focus-visible:border-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        "aria-invalid:border-destructive disabled:bg-background disabled:cursor-not-allowed disabled:opacity-65",
        "[@media(pointer:coarse)]:text-base",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  children,
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className={cn(
          "z-[70] overflow-hidden",
          "min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] max-h-[var(--radix-select-content-available-height)]",
          "rounded-md border border-border bg-surface p-1 shadow-lg",
          "data-[state=open]:animate-[menu-in_160ms_ease-out] data-[state=closed]:animate-[menu-out_120ms_ease-in]",
          className,
        )}
        position="popper"
        sideOffset={5}
        {...props}
      >
        <SelectPrimitive.Viewport className="max-h-[min(320px,var(--radix-select-content-available-height))] overflow-y-auto">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  children,
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex min-h-9 cursor-pointer select-none items-center",
        "rounded px-8 py-2 text-sm outline-none [overflow-wrap:anywhere]",
        "data-[state=checked]:font-semibold data-[highlighted]:bg-surface-hover data-[highlighted]:text-foreground",
        "data-[disabled]:opacity-65 data-[disabled]:pointer-events-none",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check aria-hidden="true" className="size-4 text-primary" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
