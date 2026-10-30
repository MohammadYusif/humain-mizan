import { Eye, EyeOff, KeyRound, LoaderCircle, UserRound } from "lucide-react"
import { useId, useState, type FormEvent, type KeyboardEvent } from "react"

import { LogoMark } from "@/components/logo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, errorMessage } from "@/lib/api"

// The route colours as they read on the ink panel (the lighter, dark-theme values), in both themes.
const ROUTES = [
  { label: "Approve", dot: "bg-[oklch(0.8_0.12_152)]", text: "Meets the playbook. Nobody needs to touch it." },
  { label: "Negotiate", dot: "bg-[oklch(0.83_0.12_78)]", text: "The redline goes to the counterparty." },
  { label: "Escalate", dot: "bg-[oklch(0.75_0.13_35)]", text: "A lawyer gets it with the exact question." },
]

/** One clause as Mizan reviews it: the quote, the rule it breaks, the redline, the route. */
function ReviewedClause() {
  return (
    <figure className="overflow-hidden rounded-lg border border-ink-foreground/15 bg-paper text-foreground">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3 text-xs text-muted-foreground">
        <span className="font-mono">Services agreement · c4</span>
        <span className="rounded-sm bg-negotiate-soft px-1.5 py-0.5 font-medium text-negotiate">Major</span>
      </div>
      <div className="flex flex-col gap-4 px-5 py-5">
        <p dir="rtl" lang="ar" className="text-[1.05rem] leading-loose">
          المادة الرابعة: في حال التأخر في السداد، يستحق مقدم الخدمة{" "}
          <mark className="rounded-sm bg-highlight px-1 text-foreground">فائدة بنسبة 2% شهرياً</mark> على المبالغ
          المتأخرة.
        </p>
        <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Playbook</dt>
          <dd>No recurring interest on late payment.</dd>
          <dt className="text-muted-foreground">Redline</dt>
          <dd>A one-time fee of no more than 1% of the overdue amount.</dd>
        </dl>
      </div>
      <figcaption className="flex items-center justify-between gap-3 border-t px-5 py-3 text-xs text-muted-foreground">
        <span>Route, computed by code from the findings</span>
        {/* A rubber stamp, as in the video: the one uppercase label on the page, on purpose. */}
        <span
          aria-label="Negotiate"
          className="-rotate-3 rounded-sm border-2 border-negotiate px-2 py-0.5 font-mono text-[0.8rem] font-semibold tracking-wide text-negotiate"
        >
          NEGOTIATE
        </span>
      </figcaption>
    </figure>
  )
}

/** The only screen someone without a session sees: the deployment is private, by invitation. */
export function SignIn({ onSignedIn }: { onSignedIn: (user: string) => void }) {
  const id = useId()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [caps, setCaps] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) return setError("Enter your user name and password.")
    setBusy(true)
    setError(null)
    try {
      const me = await api.login(username.trim(), password)
      onSignedIn(me.user ?? username.trim())
    } catch (err) {
      setError(errorMessage(err))
      setPassword("")
    } finally {
      setBusy(false)
    }
  }
  const watchCaps = (e: KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState("CapsLock"))

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-background lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:grid-rows-1">
      {/* Phones and tablets: the brand panel, condensed to a header. */}
      <header className="relative overflow-hidden bg-ink px-5 pt-8 pb-9 text-ink-foreground sm:px-8 lg:hidden">
        <span className="relative inline-flex items-center gap-3">
          <LogoMark inverse className="size-10" />
          <span className="flex items-baseline gap-2">
            <span className="font-heading text-2xl leading-none font-semibold tracking-tight">Mizan</span>
            <span lang="ar" className="leading-none text-brass">
              ميزان
            </span>
          </span>
        </span>
        <p className="relative mt-6 max-w-md font-heading text-[1.6rem] leading-[1.15] font-semibold tracking-tight text-balance">
          Every clause checked against your playbook, in Arabic and English.
        </p>
        <ul className="relative mt-5 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {ROUTES.map((r) => (
            <li key={r.label} className="inline-flex items-center gap-2">
              <span aria-hidden className={`size-2 rounded-full ${r.dot}`} />
              {r.label}
            </li>
          ))}
        </ul>
      </header>
      <section className="relative hidden flex-col justify-between gap-10 overflow-hidden bg-ink p-12 text-ink-foreground lg:flex xl:p-16">
        {/* The balance, large and faint: the product's mark, not a decoration from elsewhere. */}
        <svg
          viewBox="0 0 32 32"
          aria-hidden
          className="pointer-events-none absolute -end-28 -bottom-20 size-[36rem] text-ink-foreground opacity-[0.07]"
        >
          <g fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 9.5V23.5M11.5 23.5h9M6.5 10.5h19M8 10.5 5.2 17.2M8 10.5l2.8 6.7M24 10.5l-2.8 6.7M24 10.5l2.8 6.7" />
            <path d="M4.6 17.2h6.8a3.4 3.4 0 0 1-6.8 0zM20.6 17.2h6.8a3.4 3.4 0 0 1-6.8 0z" />
            <circle cx="16" cy="9.6" r="1.9" />
          </g>
        </svg>
        <span className="relative inline-flex items-center gap-3">
          <LogoMark inverse className="size-11" />
          <span className="flex items-baseline gap-2">
            <span className="font-heading text-3xl leading-none font-semibold tracking-tight">Mizan</span>
            <span lang="ar" className="text-lg leading-none text-brass">
              ميزان
            </span>
          </span>
        </span>

        <div className="relative flex max-w-xl flex-col gap-8">
          <h1 className="font-heading text-4xl leading-[1.12] font-semibold tracking-tight text-balance xl:text-[2.75rem]">
            Every clause checked against your playbook, in Arabic and English.
          </h1>
          <ReviewedClause />
          <ul className="grid gap-3 text-sm sm:grid-cols-3">
            {ROUTES.map((r) => (
              <li key={r.label} className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-2 font-semibold">
                  <span aria-hidden className={`size-2 rounded-full ${r.dot}`} />
                  {r.label}
                </span>
                <span className="leading-snug text-ink-muted">{r.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-ink-muted">
          Decision support generated by an AI agent, not legal advice. The route is computed by code.
        </p>
      </section>

      <section className="flex items-start justify-center px-5 py-10 sm:px-8 lg:items-center lg:py-12">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h2 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A private preview for the HUMAIN Future AI Builders Hackathon. Access is by invitation.
            </p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-user`}>User name</Label>
              <div className="relative">
                <UserRound
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id={`${id}-user`}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  aria-invalid={Boolean(error) && !username.trim()}
                  className="h-11 bg-card ps-9"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-pw`}>Password</Label>
              <div className="relative">
                <KeyRound
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id={`${id}-pw`}
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={watchCaps}
                  onKeyDown={watchCaps}
                  aria-describedby={caps ? `${id}-caps` : undefined}
                  className="h-11 bg-card ps-9 pe-11"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute end-1 top-1/2 size-9 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  aria-pressed={show}
                >
                  {show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                </Button>
              </div>
              {caps ? (
                <p id={`${id}-caps`} className="text-xs font-medium text-negotiate">
                  Caps Lock is on.
                </p>
              ) : null}
            </div>
            {error ? (
              <Alert className="border-escalate/40 bg-escalate-soft" aria-live="polite">
                <AlertDescription className="text-foreground/85">{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" className="h-11 text-[0.95rem]" disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="flex flex-col gap-1.5 border-t pt-5 text-xs leading-relaxed text-muted-foreground">
            <p>You stay signed in on this device for 12 hours.</p>
            <p>No account yet? Ask the person who invited you.</p>
          </div>
          <p className="text-xs text-muted-foreground lg:hidden">
            Decision support generated by an AI agent, not legal advice.
          </p>
        </div>
      </section>
    </div>
  )
}
