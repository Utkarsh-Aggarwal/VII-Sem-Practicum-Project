import Link from "next/link";
import { LoaderCircle, type LucideIcon } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover shadow-sm",
  secondary: "bg-surface text-ink ring-1 ring-inset ring-line hover:bg-surface-2",
  ghost: "text-muted hover:bg-surface-2 hover:text-ink",
  danger: "bg-bad text-white hover:opacity-90 shadow-sm",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-xl",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `inline-flex shrink-0 items-center justify-center font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${extra}`;
}

type Common = { variant?: Variant; size?: Size; icon?: LucideIcon; className?: string; children?: React.ReactNode };

export function Button({
  variant,
  size,
  icon: Icon,
  loading,
  className = "",
  children,
  ...rest
}: Common & { loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={loading || rest.disabled} {...rest}>
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant, size, icon: Icon, className = "", children }: Common & { href: string }) {
  const external = href.startsWith("tel:") || href.startsWith("http");
  const cls = buttonClass(variant, size, className);
  const content = (
    <>
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </>
  );
  return external ? (
    <a href={href} className={cls}>
      {content}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {content}
    </Link>
  );
}
