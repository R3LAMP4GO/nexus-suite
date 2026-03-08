import { type HTMLAttributes, type ElementType } from "react";

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
}

export function Card({
  as: Tag = "div",
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <Tag
      className={`rounded-lg border bg-white p-6 shadow-sm ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}
