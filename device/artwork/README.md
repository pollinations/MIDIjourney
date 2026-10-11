# Optimized device button artwork

Four 338 × 338 indexed PNGs for a 169 × 169 Live panel at 2× display scale. The current artwork uses the Pollinations pixel-art music-garden style. Flat design applies to app controls, not brand illustrations. Generated masters are preserved outside the build; only the optimized assets are shipped.

Optimization: ImageMagick resize to 338 × 338, metadata removal, 32-color palette without dithering, PNG compression level 9. Each file is under 50 KB; tests enforce that limit and a combined limit of 160 KB.

Example (repeat for each state):

```sh
magick /path/to/artwork-masters/open-connected.png -resize 338x338 -strip -dither None -colors 32 -define png:compression-level=9 PNG8:device/artwork/open-connected.png
```

OPEN/CLOSE indicates the click action, not the current window state. The top-right connection light reflects only the SDK's boolean login state; no key, profile, balance or chat content is sent to the panel controller.
