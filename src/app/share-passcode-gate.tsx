import * as React from "react";
import { LockKeyhole } from "lucide-react";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  Input,
} from "@/toolcraft/ui";

import { PortalBrand } from "./portal-ui";

type SharePasscodeGateProps = {
  description: string;
  error?: string;
  loading: boolean;
  onPasscodeChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  passcode: string;
  title: string;
};

export function SharePasscodeGate({
  description,
  error,
  loading,
  onPasscodeChange,
  onSubmit,
  passcode,
  title,
}: SharePasscodeGateProps): React.JSX.Element {
  return (
    <main className="portal-shell flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <div className="px-1">
          <PortalBrand context="Secure client review" />
        </div>
        <Card className="w-full border-[color:var(--portal-border-strong)] bg-[color:var(--portal-surface-1)] shadow-2xl shadow-black/25">
          <CardHeader className="items-center text-center">
            <span
              aria-hidden="true"
              className="mb-2 grid size-11 place-items-center rounded-xl border border-blue-400/25 bg-blue-400/10 text-blue-200"
            >
              <LockKeyhole className="size-5" />
            </span>
          <CardTitle
            aria-level={1}
              className="text-2xl"
            role="heading"
          >
            {title}
          </CardTitle>
          <CardDescription className="text-sm leading-6">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <Field>
              <FieldLabel htmlFor="share-passcode">Passcode</FieldLabel>
              <Input
                aria-describedby={error ? "share-passcode-error" : undefined}
                aria-invalid={Boolean(error)}
                autoComplete="current-password"
                autoFocus
                id="share-passcode"
                name="passcode"
                onChange={(event) => onPasscodeChange(event.target.value)}
                required
                size="lg"
                type="password"
                value={passcode}
              />
            </Field>
            {error ? (
              <p
                className="text-sm text-red-300"
                id="share-passcode-error"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <Button className="w-full" disabled={loading || !passcode} size="xl" type="submit">
              <LockKeyhole aria-hidden="true" />
              {loading ? "Checking passcode…" : "Unlock review"}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </main>
  );
}
