import React from "react";
import EmbeddingsTest from "./embeddingsTest";
import { BrandVariants, FluentProvider, Theme, createLightTheme } from "@fluentui/react-components";

const maochatTheme: BrandVariants = {
  10: "#050109",
  20: "#1E0F34",
  30: "#33125D",
  40: "#46127D",
  50: "#5B0D9B",
  60: "#7203B7",
  70: "#8A00CD",
  80: "#A200E1",
  90: "#BA00F5",
  100: "#CF21FF",
  110: "#DE44FF",
  120: "#EB5FFF",
  130: "#F678FF",
  140: "#FE90FF",
  150: "#FFABFB",
  160: "#FFC4F8"
};

const lightTheme: Theme = {
  ...createLightTheme(maochatTheme),
};

export function Component() {
  return (
    <React.StrictMode>
      <FluentProvider theme={lightTheme}>
        <EmbeddingsTest available_models={["text-embedding-ada-002"]} />
      </FluentProvider>
    </React.StrictMode>
  );
}