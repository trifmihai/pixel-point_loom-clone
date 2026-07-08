import { Navigate } from "@tanstack/react-router";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/toolcraft/ui";

export function AppHome(): React.JSX.Element {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[color:var(--background)] px-4 text-[color:var(--foreground)]">
      <Navigate replace to="/admin" />
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle aria-level={1} className="text-2xl" role="heading">
            Opening admin
          </CardTitle>
          <CardDescription className="text-sm leading-6">
            The admin dashboard is served from the protected admin route.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button nativeButton={false} render={<a href="/admin" />} size="lg" variant="outline">
            Open admin
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
