import { Outlet, createRootRoute, createRoute } from "@tanstack/react-router";

import { SharePortal } from "../app/share-portal";
import { AppHome } from "./index";

function RootLayout(): React.JSX.Element {
  return <Outlet />;
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  component: AppHome,
  getParentRoute: () => rootRoute,
  path: "/",
});

const shareRoute = createRoute({
  component: ShareRoute,
  getParentRoute: () => rootRoute,
  path: "/share/$slug",
  validateSearch: (search: Record<string, unknown>) => ({
    data: typeof search.data === "string" ? search.data : undefined,
  }),
});

function ShareRoute(): React.JSX.Element {
  const { slug } = shareRoute.useParams();
  const { data } = shareRoute.useSearch();

  return <SharePortal encodedData={data} slug={slug} />;
}

export const routeTree = rootRoute.addChildren([indexRoute, shareRoute]);
