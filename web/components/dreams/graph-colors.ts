/** Resolve CSS colors into hex sRGB values accepted by both Three.js and polished. */
export function readGraphColors() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas color conversion is unavailable.');
  const styles = getComputedStyle(document.documentElement);
  const resolve = (name: string): string => {
    const value = styles.getPropertyValue(name).trim();
    if (!value || !CSS.supports('color', value)) {
      throw new Error(`Graph color ${name} is missing or invalid.`);
    }
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    return `#${[red, green, blue].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  };
  return {
    background: resolve('--background'),
    document: resolve('--graph-document'),
    shared: resolve('--graph-shared'),
    person: resolve('--graph-person'),
    project: resolve('--graph-project'),
    customer: resolve('--graph-customer'),
    decision: resolve('--graph-decision'),
  };
}
