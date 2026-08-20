import { VideoSharePortal } from "./video-share-portal";

type VideoEmbedPortalProps = {
  encodedData?: string;
  slug: string;
};

export function VideoEmbedPortal({
  encodedData,
  slug,
}: VideoEmbedPortalProps): React.JSX.Element {
  return <VideoSharePortal encodedData={encodedData} presentation="embed" slug={slug} />;
}
