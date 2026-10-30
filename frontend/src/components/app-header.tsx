import { Clapperboard, Inbox, Layers, Lightbulb, LogOut, Monitor, Moon, ScrollText, ShieldCheck, Sun, UserRound } from "lucide-react"
import type { ReactNode } from "react"

import { LogoMark } from "@/components/logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Health } from "@/lib/api"
import { modelName } from "@/lib/format"
import { useTheme, type Theme } from "@/lib/theme"

function HealthBadge({ health, error }: { health: Health | null; error: string | null }) {
  if (error) {
    return (
      <Badge variant="outline" className="gap-1.5 rounded-md border-escalate/40 bg-escalate-soft text-escalate">
        <span aria-hidden className="size-1.5 rounded-full bg-escalate" />
        API offline
      </Badge>
    )
  }
  if (!health) {
    return (
      <Badge variant="outline" className="gap-1.5 rounded-md text-muted-foreground">
        <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground" />
        Connecting
      </Badge>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          tabIndex={0}
          className="h-7 max-w-[11rem] gap-1.5 rounded-md bg-card px-2 text-xs font-normal text-foreground sm:max-w-none"
        >
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-approve" />
          <span className="truncate">{modelName(health.model)}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="flex flex-col gap-0.5">
        <span>Reviews run on {health.model} ({health.provider})</span>
        {health.ocr ? <span>Scans: {health.ocr.available ? health.ocr.detail : "OCR not available on this server"}</span> : null}
      </TooltipContent>
    </Tooltip>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Colour theme">
          <Sun className="dark:hidden" aria-hidden />
          <Moon className="hidden dark:block" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The four product areas. Lives inside the app-level <Tabs>, so it drives the hash route. */
export function AreaNav({ inboxCount }: { inboxCount: number | null }) {
  const item = "h-full gap-1.5 px-1.5 text-[0.78rem] sm:px-3 sm:text-sm"
  return (
    <TabsList aria-label="Areas" className="grid h-10! w-full grid-cols-5 lg:inline-flex lg:w-auto">
      <TabsTrigger value="review" className={item}>
        <ScrollText aria-hidden className="hidden sm:block" />
        Review
      </TabsTrigger>
      <TabsTrigger value="queue" className={item}>
        <Layers aria-hidden className="hidden sm:block" />
        Queue
      </TabsTrigger>
      <TabsTrigger value="inbox" className={item}>
        <Inbox aria-hidden className="hidden sm:block" />
        Inbox
        {inboxCount ? (
          <Badge
            aria-label={`${inboxCount} waiting`}
            className="h-4.5 min-w-4.5 rounded-sm bg-escalate px-1 font-mono text-[0.7rem] text-paper tabular"
          >
            {inboxCount}
          </Badge>
        ) : null}
      </TabsTrigger>
      <TabsTrigger value="insights" className={item}>
        <Lightbulb aria-hidden className="hidden sm:block" />
        Insights
      </TabsTrigger>
      <TabsTrigger value="proof" className={item}>
        <ShieldCheck aria-hidden className="hidden sm:block" />
        Proof
      </TabsTrigger>
    </TabsList>
  )
}

function UserMenu({ user, onSignOut }: { user: string; onSignOut?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-1.5 px-2" aria-label={`Signed in as ${user}`}>
          <UserRound aria-hidden />
          <span className="hidden max-w-28 truncate text-sm font-normal md:inline">{user}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="font-normal text-muted-foreground">Signed in as {user}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onSignOut?.()}>
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppHeader({
  health,
  healthError,
  nav,
  onDemo,
  user,
  onSignOut,
}: {
  health: Health | null
  healthError: string | null
  nav: ReactNode
  /** Starts the guided demo; undefined while one is running. */
  onDemo?: () => void
  /** Who is signed in on a deployment; null when sign-in is off (local development). */
  user?: string | null
  onSignOut?: () => void
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-3 sm:px-6 lg:h-16 lg:flex-nowrap lg:py-0">
        <a
          href="#review"
          aria-label="Mizan home"
          className="shrink-0 rounded-[7px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <LogoMark />
        </a>
        <div className="min-w-0 shrink-0">
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-[1.4rem] leading-none font-semibold tracking-tight">Mizan</span>
            <span lang="ar" className="hidden text-sm leading-none text-brass-ink sm:inline" style={{ lineHeight: 1 }}>
              ميزان
            </span>
          </div>
          <p className="mt-1 hidden truncate text-xs text-muted-foreground xl:block">
            Contract review for in-house legal
          </p>
        </div>
        <nav className="order-last basis-full lg:order-none lg:ms-4 lg:basis-auto">{nav}</nav>
        <div className="ms-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
          {onDemo ? (
            <Button variant="outline" onClick={onDemo} className="h-9 min-w-9 gap-1.5" aria-label="Start the guided demo">
              <Clapperboard aria-hidden />
              <span className="hidden sm:inline">Guided demo</span>
            </Button>
          ) : null}
          <HealthBadge health={health} error={healthError} />
          <ThemeToggle />
          {user ? <UserMenu user={user} onSignOut={onSignOut} /> : null}
        </div>
      </div>
    </header>
  )
}
