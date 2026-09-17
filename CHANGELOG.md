# Changelog

## [0.1.0] - 2026-09-17

### Added
- Local Git repository scaffold
- Synthetic participant data generator
- Data-adaptive draw design decisions
- Real employee CSV exclusion policy

### Added in prototype v0.2
- Browser-local CSV loader + SHA-256 audit fingerprint
- Dynamic Round Planner based on current survivor distribution
- Population-weighted Gate draw preserving equal individual probability
- 16:9 live-show UI with Survivor Index and dynamic Gate sizing
- Final 8 / 4 / 2 / 1 uniform subset sequence
- Web Crypto random source, synth sound cues, particle effects
- Local pre-commit / pre-push validation hooks
- 1600×900 headless-browser render verification and preview image

## [0.3.0] - 2026-09-17

### Added
- Full-panel marble-style kinetic reveal overlay for every draw stage
- Four kinetic visual modes: VORTEX GATE, GEAR RUN, PLINKO DROP, REACTOR SPIN
- Population-proportional roulette sectors and animated landing needle
- Finalist Marble Lock for 18→8→4→2 and Last Marble reveal for 2→1
- Finalist labels on the marble field when 8 or fewer remain
- Roulette tick/rumble sound sequence and stronger impact timing
- Full Chrome runtime verification through the entire 150→75→36→18→8→4→2→1 flow
- Mid-spin and result screenshots for visual QA

### Changed
- Marble animation is explicitly a reveal layer; Web Crypto / weighted-gate logic remains authoritative
- Dynamic round timing increased to create a short acceleration / final-spin / gate-lock tension curve

### Deployment
- GitHub repository: `01chungee10snu/chuseok-draw-show`
- GitHub Pages: `https://01chungee10snu.github.io/chuseok-draw-show/`
- Pages source: `main /`

## [0.4.0] - 2026-09-17

### Added
- Header Roulette that reevaluates eligible headers from the current survivor population every round
- Unique-value Group Engine for categorical headers with 2~7 actual values
- Dynamic numeric/date bucketing based on the current survivor distribution
- Balanced two-lane assignment of value groups while preserving every current survivor
- Group-only show phase with individual identities sealed
- Automatic Identity Reveal once the survivor population naturally reaches 5~10 people
- Group-marble animation sized by actual group population
- Dedicated validation suite for group coverage, balance, no duplicate membership, used-header exclusion, and exact `1/N` fairness algebra
- Chrome runtime verification for both pools
- Visual QA screenshots: `group-header-round.png`, `identity-reveal.png`

### Changed
- Early/mid draw progression is now Header → Unique Values → Group Race instead of individual-marble presentation
- Exact Final 8 forcing was removed; the group phase now ends naturally in the 5~10 range
- Final phase becomes Identity Reveal → Final 4 → 2 → 1
- Brand/UI wording changed to Group Roulette; no third-party project branding is used

### Verified flows
- Manager pool: `150 → 75 → 37 → 19 → 8 → 4 → 2 → 1`
- Senior+ pool: `90 → 43 → 24 → 12 → 6` then Identity Reveal

### Next
- Replace the prototype kinetic renderer with a Box2D physics canary while keeping the v0.4 Header/Group fairness engine authoritative

## [0.5.0] - 2026-09-17

### Added
- Dedicated show configuration for each group round instead of reusing one kinetic pattern
- Round 1 `STEEL DROP`: gravity-style vertical drop, steel rails, magnet-release cue
- Round 2 `MOON ORBIT`: lunar orbital field, shrinking ellipse motion, orbit-decay tension
- Round 3 `PINBALL GRID`: peg matrix, bouncing descent, final-slot tension
- Round 4 `FURNACE SPLIT`: conveyor motion, rotating furnace field, heat-gate reveal
- Fallback group stage `LAST GATE` when a fifth group round is needed
- Three distinct final stages: `SPOTLIGHT CUT`, `TWIN ORBIT`, `LAST MARBLE`
- Stage-specific sound cues and phase wording
- Automated tests locking the stage sequence and final-stage mapping
- Chrome runtime verification showing all seven stages in one complete draw
- Visual QA screenshots for all four group stages plus all three final stages

### Verified flow
- Manager pool runtime: `150 → 75 → 35 → 18 → 8 → 4 → 2 → 1`
- Observed stages: `STEEL DROP → MOON ORBIT → PINBALL GRID → FURNACE SPLIT → SPOTLIGHT CUT → TWIN ORBIT → LAST MARBLE`
- Automated tests: `12/12 PASS`

## [0.6.0] - 2026-09-17

### Added
- `box2d-wasm` show-only physics layer bundled as WebAssembly
- Real Box2D physics for `STEEL DROP`, `PINBALL GRID`, and `LAST MARBLE`
- Steel ramps, bumpers, walls, pinball pegs, restitution/friction and dynamic-body collisions
- Physics fallback isolation: fair-draw result remains authoritative even if physics initialization fails
- Vite production build with bundled SIMD/non-SIMD Box2D WASM
- GitHub Actions Pages workflow that tests and builds before deployment
- Third-party notices and license copies for `lazygyu/roulette`, `box2d-wasm`, and bundled SIMD feature-detection code
- Production-build visual QA screenshots for all three Box2D stages

### Changed
- Synthetic demo data moved to `public/data/demo_participants.csv` so it is included in the Vite build
- Local runtime moved from raw `python -m http.server` to Vite dev/build/preview commands
- GitHub Pages deployment source changed from repository-root static files to the tested `dist/` artifact

### Verified flow
- Production preview full run completed through all stages with Box2D active on the designated stages
- Browser loaded `Box2D.simd.wasm` from the local production bundle
- Runtime JavaScript exceptions: `0`
- Physics fallback events: `0`
- `npm audit`: `0 vulnerabilities`
- Automated tests: `13/13 PASS`
