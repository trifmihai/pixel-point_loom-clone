import * as React from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
} from "@/toolcraft/ui";

import { getAppConfig } from "./app-config";
import { getPortalApiErrorMessage, portalApi } from "./portal-api";

type AdminAuthGateProps = {
  children: React.ReactNode;
};

type AdminAuthState = "authenticated" | "checking" | "login";

function isProductionPagesHost(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.hostname === "pixel-point-loom-clone.pages.dev"
  );
}

export function AdminAuthGate({ children }: AdminAuthGateProps): React.JSX.Element {
  const config = React.useMemo(() => getAppConfig(), []);
  const requiresAdminSession = config.cloudSyncEnabled || isProductionPagesHost();
  const [authState, setAuthState] = React.useState<AdminAuthState>(
    requiresAdminSession ? "checking" : "authenticated",
  );
  const [adminEmail, setAdminEmail] = React.useState(config.adminEmail);
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!requiresAdminSession) {
      setAuthState("authenticated");
      return undefined;
    }

    let cancelled = false;

    void portalApi
      .getAdminSession()
      .then((session) => {
        if (cancelled) {
          return;
        }

        setAdminEmail(session.adminEmail);
        setAuthState(session.authenticated ? "authenticated" : "login");
      })
      .catch((sessionError: unknown) => {
        if (cancelled) {
          return;
        }

        setError(getPortalApiErrorMessage(sessionError));
        setAuthState("login");
      });

    return () => {
      cancelled = true;
    };
  }, [requiresAdminSession]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!password || submitting) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const session = await portalApi.loginAdmin(password);

      setAdminEmail(session.adminEmail);
      setPassword("");
      setAuthState(session.authenticated ? "authenticated" : "login");
    } catch (loginError) {
      setError(getPortalApiErrorMessage(loginError));
    } finally {
      setSubmitting(false);
    }
  }

  if (authState === "authenticated") {
    return <>{children}</>;
  }

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md items-center">
        <Card className="w-full">
          <CardHeader>
            <Badge className="w-fit gap-2" variant="secondary">
              <ShieldCheck className="size-4" />
              Admin access
            </Badge>
            <CardTitle aria-level={1} className="text-2xl" role="heading">
              Sign in to the dashboard
            </CardTitle>
            <CardDescription className="text-sm leading-6">
              Use the app admin password to manage Gumlet review links for {adminEmail}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {authState === "checking" ? (
              <div className="flex items-center gap-3 rounded-md border border-white/10 bg-black/10 p-3 text-sm text-[color:var(--muted-foreground)]">
                <LockKeyhole className="size-4" />
                Checking admin session.
              </div>
            ) : (
              <form className="space-y-4" onSubmit={(event) => void handleLogin(event)}>
                <FieldGroup className="gap-3">
                  <Field>
                    <FieldLabel htmlFor="admin-password">Admin password</FieldLabel>
                    <Input
                      autoComplete="current-password"
                      autoFocus
                      id="admin-password"
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      size="lg"
                      type="password"
                      value={password}
                    />
                  </Field>
                </FieldGroup>
                {error ? (
                  <Alert variant="destructive">
                    <AlertTitle>Sign in failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                <Button disabled={submitting || !password} size="xl" type="submit">
                  <LockKeyhole />
                  {submitting ? "Signing in" : "Sign in"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
