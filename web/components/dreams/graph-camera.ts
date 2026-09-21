import type { GraphNode } from './graph-data';

/** Three's default for this renderer, in degrees. The fit is derived from it, not guessed at. */
const FIELD_OF_VIEW = 50;

/** How far the camera sits above the plane the graph turns in. */
export const TILT_DEGREES = 13;

/** Just enough air that a node's own radius is not flush against the edge. */
const MARGIN = 1.02;

export interface CameraPlacement {
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Where to put the camera so the whole graph fills the frame and stays in it while it turns.
 *
 * The graph turns about the vertical axis only, which is what lets this be tight. Height never
 * changes as it turns, so it is measured once. Width does change, and its worst case is the
 * cloud's radius in the horizontal plane: whatever the angle, nothing reaches further out than
 * that. Fitting a whole bounding sphere instead would be safe too, and would leave the graph
 * small in the frame, because these layouts are much wider than they are tall.
 */
export function placeCamera(nodes: readonly GraphNode[], aspect: number): CameraPlacement | null {
  const placed = nodes.filter(
    (node) =>
      typeof node.x === 'number' && typeof node.y === 'number' && typeof node.z === 'number',
  );
  if (placed.length === 0) return null;

  const lookAt = {
    x: placed.reduce((sum, node) => sum + (node.x ?? 0), 0) / placed.length,
    y: placed.reduce((sum, node) => sum + (node.y ?? 0), 0) / placed.length,
    z: placed.reduce((sum, node) => sum + (node.z ?? 0), 0) / placed.length,
  };

  let halfHeight = 0;
  let halfWidth = 0;
  for (const node of placed) {
    halfHeight = Math.max(halfHeight, Math.abs((node.y ?? 0) - lookAt.y));
    halfWidth = Math.max(halfWidth, Math.hypot((node.x ?? 0) - lookAt.x, (node.z ?? 0) - lookAt.z));
  }
  if (halfHeight === 0 && halfWidth === 0) return null;

  const vertical = toRadians(FIELD_OF_VIEW);
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(aspect, 0.1));
  const distance =
    Math.max(halfHeight / Math.sin(vertical / 2), halfWidth / Math.sin(horizontal / 2)) * MARGIN;

  const tilt = toRadians(TILT_DEGREES);
  return {
    lookAt,
    position: {
      x: lookAt.x,
      y: lookAt.y + distance * Math.sin(tilt),
      z: lookAt.z + distance * Math.cos(tilt),
    },
  };
}
