import { SOURCES as originalSources, SNAPSHOTS as originalSnapshots } from './content/core.js';
import * as ancient from './content/ancient.js';
import * as medieval from './content/medieval.js';
import * as joseon from './content/joseon.js';
import * as modern from './content/modern.js';
import { assembleAtlas } from './assemble.js';
export { ERAS } from './content/eras.js';

const atlas = assembleAtlas({
  legacy: { sources: originalSources, snapshots: originalSnapshots },
  modules: [ancient, medieval, joseon, modern],
});
export const SOURCES = atlas.sources;
export const SNAPSHOTS = atlas.snapshots;
export const FIGURES = atlas.figures;
export const POLITIES = atlas.polities;
