import { Outlet, createRootRoute, createRoute } from "@tanstack/react-router";

import { SharePortal } from "../app/share-portal";
import { VideoSharePortal } from "../app/video-share-portal";
import { AdminHome } from "./admin";
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

const adminRoute = createRoute({
  component: AdminHome,
  getParentRoute: () => rootRoute,
  path: "/admin",
});

const shareRoute = createRoute({
  component: ShareRoute,
  getParentRoute: () => rootRoute,
  path: "/share/$slug",
  validateSearch: (search: Record<string, unknown>) => ({
    data: typeof search.data === "string" ? search.data : undefined,
  }),
});

const videoRoute = createRoute({
  component: VideoRoute,
  getParentRoute: () => rootRoute,
  path: "/video/$slug",
  validateSearch: (search: Record<string, unknown>) => ({
    comment: typeof search.comment === "string" && search.comment.trim() ? search.comment : undefined,
    data: typeof search.data === "string" ? search.data : undefined,
  }),
});

function ShareRoute(): React.JSX.Element {
  const { slug } = shareRoute.useParams();
  const { data } = shareRoute.useSearch();

  return <SharePortal encodedData={data} slug={slug} />;
}

function VideoRoute(): React.JSX.Element {
  const { slug } = videoRoute.useParams();
  const { comment, data } = videoRoute.useSearch();

  return <VideoSharePortal directCommentId={comment} encodedData={data} slug={slug} />;
}

export const routeTree = rootRoute.addChildren([indexRoute, adminRoute, shareRoute, videoRoute]);
