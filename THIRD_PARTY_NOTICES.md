# Third-Party Notices

## lazygyu/roulette

This project was informed by the open-source physics/rendering architecture of `lazygyu/roulette`.

- Upstream: https://github.com/lazygyu/roulette
- Copyright (c) 2022 LazyGyu
- License: MIT
- License copy: `licenses/lazygyu-roulette-MIT.txt`

The upstream project name/branding is not used as this application's product name. The current application retains its own fair-draw engine; physics is used only as a result-reveal layer.

## box2d-wasm

The browser physics layer uses `box2d-wasm`.

- Upstream: https://github.com/Birch-san/box2d-wasm
- Copyright (c) 2020 Alex Birch
- License: Zlib
- License copy: `licenses/box2d-wasm-zlib.txt`

The WebAssembly binaries are bundled into the static production build by Vite.

`box2d-wasm` also includes SIMD feature-detection code derived from `wasm-feature-detect` under the Apache License 2.0. A copy is included at `licenses/wasm-feature-detect-Apache-2.0.txt`.

These notice and license files are copied into the production `dist/` artifact during `npm run build`.
