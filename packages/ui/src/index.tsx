import Link from "next/link";
import Image from "next/image";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { useId } from "react";

export interface NavigationItem {
  readonly href: string;
  readonly label: string;
}

export function SkipLink({ href = "#main" }: { readonly href?: string }) {
  return (
    <a className="skip-link" href={href}>
      Skip to content
    </a>
  );
}

export function Brand({ compact = false }: { readonly compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="Theoria home">
      <Image
        className="brand-mark"
        src="/theoria-mark.svg"
        alt=""
        width={32}
        height={32}
        priority
      />
      {compact ? null : <span>Theoria</span>}
    </Link>
  );
}

export function Navigation({
  items,
  label,
  className = "",
}: {
  readonly items: readonly NavigationItem[];
  readonly label: string;
  readonly className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      {items.map((item) => (
        <Link href={item.href} key={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`.trim()} {...props} />;
}

export function LinkButton({
  href,
  children,
  secondary = false,
}: {
  readonly href: string;
  readonly children: ReactNode;
  readonly secondary?: boolean;
}) {
  return (
    <Link
      className={`button${secondary ? " button-secondary" : ""}`}
      href={href}
    >
      {children}
    </Link>
  );
}

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  readonly label: string;
  readonly hint?: string;
}) {
  const id = props.id ?? props.name ?? label.toLowerCase().replaceAll(" ", "-");
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} {...props} />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function Status({
  children,
  tone = "neutral",
}: {
  readonly children: ReactNode;
  readonly tone?: "neutral" | "positive" | "warning";
}) {
  return <span className={`status status-${tone}`}>{children}</span>;
}

export function Notice({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className="notice" aria-labelledby={titleId}>
      <div className="notice-mark" aria-hidden="true">
        ↗
      </div>
      <div>
        <h2 id={titleId}>{title}</h2>
        <p>{children}</p>
      </div>
    </section>
  );
}
