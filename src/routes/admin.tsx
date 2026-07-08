import { ToolcraftApp } from "@/toolcraft/runtime/react";

import { AdminPortal } from "../app/admin-portal";
import { appSchema } from "../app/app-schema";

export function AdminHome(): React.JSX.Element {
  return (
    <>
      <div hidden>
        <ToolcraftApp schema={appSchema} />
      </div>
      <AdminPortal />
    </>
  );
}
