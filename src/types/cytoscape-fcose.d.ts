// cytoscape-fcose ships no TypeScript declarations; this shim types the
// registration contract only. Layout-option extensions are typed in
// GraphCanvas (FcoseLayoutOptions).
declare module "cytoscape-fcose" {
  import type cytoscape from "cytoscape";

  function fcose(cytoscape: typeof cytoscape): void;
  export default fcose;
}