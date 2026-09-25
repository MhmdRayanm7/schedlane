type PageHeaderProps = {
  title: string;
  description: string;
};

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="max-w-3xl border-b border-border pb-6">
      <h1 className="text-[28px] font-semibold tracking-[-0.025em] text-foreground">
        {title}
      </h1>
      <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
        {description}
      </p>
    </header>
  );
}
