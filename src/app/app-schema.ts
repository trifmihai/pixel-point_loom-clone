import { defineToolcraft } from "@/toolcraft/runtime";

// The portal's operational controls live in route UI, not the generated Toolcraft controls panel.
// This empty inventory therefore intentionally matches the schema's empty authored section list.
export const starterControlSectionInventory = [] as const;

export const appSchema = defineToolcraft({
  canvas: {
    enabled: true,
    upload: true,
  },
  panels: {
    controls: {
      sections: [],
      title: "Controls",
    },
  },
  toolbar: {
    history: true,
    radar: true,
    zoom: true,
  },
});
