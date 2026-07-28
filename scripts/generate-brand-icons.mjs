import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const source = await readFile(resolve(root, "public/brand/sweepza-mark.svg"));

await Promise.all([
  sharp(source)
    .resize(192, 192)
    .png()
    .toFile(resolve(root, "public/icons/icon-192.png")),
  sharp(source)
    .resize(512, 512)
    .png()
    .toFile(resolve(root, "public/icons/icon-512.png")),
  sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: "#fffaf4",
    },
  })
    .composite([{ input: await sharp(source).resize(384, 384).png().toBuffer(), left: 64, top: 64 }])
    .png()
    .toFile(resolve(root, "public/icons/maskable-512.png")),
  sharp(source)
    .resize(180, 180)
    .png()
    .toFile(resolve(root, "app/apple-icon.png")),
]);

console.log("Generated Sweepza brand launcher icons.");
