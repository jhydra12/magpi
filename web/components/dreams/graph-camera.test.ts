import { describe, expect, it } from 'vitest';

import { placeCamera, TILT_DEGREES } from './graph-camera';
import type { GraphNode } from './graph-data';

const node = (id: string, x: number, y: number, z: number): GraphNode => ({
  id,
  label: id,
  kind: 'entity',
  x,
  y,
  z,
});

const shell: GraphNode[] = [
  node('a', 100, 0, 0),
  node('b', -100, 0, 0),
  node('c', 0, 100, 0),
  node('d', 0, -100, 0),
  node('e', 0, 0, 100),
  node('f', 0, 0, -100),
];

const reach = (placement: ReturnType<typeof placeCamera>): number =>
  placement
    ? Math.hypot(
        placement.position.x - placement.lookAt.x,
        placement.position.y - placement.lookAt.y,
        placement.position.z - placement.lookAt.z,
      )
    : 0;

describe('entity graph camera', () => {
  it('looks at the middle of the graph', () => {
    expect(placeCamera(shell, 16 / 9)?.lookAt).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('sits at the tilt the graph turns through', () => {
    const placement = placeCamera(shell, 16 / 9);
    if (!placement) throw new Error('expected a placement');
    const elevation = (Math.asin(placement.position.y / reach(placement)) * 180) / Math.PI;
    expect(elevation).toBeCloseTo(TILT_DEGREES, 5);
    expect(TILT_DEGREES).toBe(13);
  });

  it('holds every node in frame from any angle, and no further back than it must', () => {
    // Half of a 50 degree opening reaches a 100 unit sphere at about 237 units.
    expect(reach(placeCamera(shell, 16 / 9))).toBeGreaterThan(237);
    expect(reach(placeCamera(shell, 16 / 9))).toBeLessThan(260);
  });

  it('pulls back further on a narrow viewport, where width runs out first', () => {
    expect(reach(placeCamera(shell, 0.5))).toBeGreaterThan(reach(placeCamera(shell, 16 / 9)));
  });

  it('scales with the graph, which is what the renderer far plane has to keep up with', () => {
    const wide = shell.map((n) => ({
      ...n,
      x: (n.x ?? 0) * 10,
      y: (n.y ?? 0) * 10,
      z: (n.z ?? 0) * 10,
    }));
    expect(reach(placeCamera(wide, 16 / 9))).toBeCloseTo(reach(placeCamera(shell, 16 / 9)) * 10, 3);
  });

  it('has nothing to frame before the simulation has placed anything', () => {
    expect(placeCamera([], 16 / 9)).toBeNull();
    expect(placeCamera([{ id: 'a', label: 'a', kind: 'entity' }], 16 / 9)).toBeNull();
  });
});
