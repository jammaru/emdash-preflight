// The plugin CLI bundles the root "zod" entry but leaves package subpaths
// external. Import the package's mini entry directly so it is included in the
// sandbox bundle and remains resolvable in the CLI's temporary probe builds.
export { z } from "../node_modules/zod/mini/index.js";
