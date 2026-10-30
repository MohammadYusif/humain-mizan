import { cn } from "cn"

/**
 * Mizan's mark: a balance with bowl pans and a brass pivot, on the ink-green tile. Drawn on a 32-unit
 * grid so it stays crisp from the 16 px favicon up; colours come from the theme tokens.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-9 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <rect width="32" height="32" rx="7" className="fill-primary" />
      <g
        fill="none"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
      >
        <path d="M16 9.5V23.5M11.5 23.5h9M6.5 10.5h19M8 10.5 5.2 17.2M8 10.5l2.8 6.7M24 10.5l-2.8 6.7M24 10.5l2.8 6.7" />
      </g>
      <path
        d="M4.6 17.2h6.8a3.4 3.4 0 0 1-6.8 0zM20.6 17.2h6.8a3.4 3.4 0 0 1-6.8 0z"
        className="fill-primary-foreground"
      />
      <circle cx="16" cy="9.6" r="1.9" className="fill-brass" />
    </svg>
  )
}

/** The mark with the name, in English and Arabic. */
export function Wordmark({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  const lg = size === "lg"
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <LogoMark className={lg ? "size-12" : "size-9"} />
      <span className="flex items-baseline gap-2">
        <span className={cn("font-heading leading-none font-semibold tracking-tight", lg ? "text-3xl" : "text-[1.4rem]")}>
          Mizan
        </span>
        <span lang="ar" className={cn("leading-none text-brass-ink", lg ? "text-lg" : "text-sm")} style={{ lineHeight: 1 }}>
          ميزان
        </span>
      </span>
    </span>
  )
}
