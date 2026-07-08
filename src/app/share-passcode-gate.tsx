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
    <main className="flex min-h-dvh items-center justify-center bg-[color:var(--background)] px-4 text-[color:var(--foreground)]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle
            aria-level={1}
            className="flex items-center justify-center gap-2 text-2xl"
            role="heading"
          >
            <LockKeyhole className="size-5" />
            {title}
          </CardTitle>
          <CardDescription className="text-sm leading-6">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <Field>
              <FieldLabel htmlFor="share-passcode">Passcode</FieldLabel>
              <Input
                autoComplete="current-password"
                autoFocus
                id="share-passcode"
                onChange={(event) => onPasscodeChange(event.target.value)}
                required
                size="lg"
                type="password"
                value={passcode}
              />
            </Field>
            {error ? (
              <p className="text-sm text-[color:var(--destructive)]" role="alert">
                {error}
              </p>
            ) : null}
            <Button className="w-full" disabled={loading} size="xl" type="submit">
              {loading ? "Checking passcode" : "Unlock review"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
