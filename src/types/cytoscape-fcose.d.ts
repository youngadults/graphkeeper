// cytoscape-fcose ships no TypeScript declarations; this shim types the
// registration contract only. Layout-option extensions are typed in
// GraphCanvas (bridged at the layoutOptions definition).
declare module "cytoscape-fcose" {
  function fcose(cytoscape: import("cytoscape").default): void;
  export default fcose;
}
