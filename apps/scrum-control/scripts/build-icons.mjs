import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

// The SVGs are the masters. Tray tiles are drawn separately in tray-icons.ts.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'assets', 'icons');
const master = await readFile(join(root, 'assets', 'icon-src', 'app.svg'), 'utf8');
const small = await readFile(join(root, 'assets', 'icon-src', 'app-small.svg'), 'utf8');
const sizes = [16, 20, 24, 32, 40, 48, 64, 256];
const render = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

// ICO supports PNG frames directly. Each directory entry points to one complete PNG.
const frames = sizes.map((size) => render(size <= 32 ? small : master, size));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  header.writeUInt8(sizes[index] === 256 ? 0 : sizes[index], entry);
  header.writeUInt8(sizes[index] === 256 ? 0 : sizes[index], entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(join(icons, 'app.ico'), Buffer.concat([header, ...frames]));
await writeFile(join(icons, 'app.png'), render(master, 256));
for (const [status, color] of [['waiting', '#FF9F0A'], ['done', '#30D158']]) {
  // A white keyline separates the badge from the blue icon and both taskbar colours.
  const badge = `<circle cx="198" cy="198" r="41" fill="#fff"/><circle cx="198" cy="198" r="32" fill="${color}"/>`;
  await writeFile(join(icons, `app-${status}.png`), render(master.replace('</svg>', `${badge}</svg>`), 256));
}
console.log('Generated app.ico and three PNG icons from SVG sources.');
