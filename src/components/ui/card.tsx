import { cn } from "@/lib/utils";
import { type HTMLAttributes, type ElementType } from "react";

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
}

export function Card({ as: Tag = "div", className, children, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm",
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mb-3 flex items-center justify-between", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("font-semibold text-[var(--text-primary)]", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardBody({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("", className)} {...props}>
      {children}
    </div>
  );
}
