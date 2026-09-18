# Changelog

## [1.2.0] - 2026-09-18

### Added
- UTF-8, CP949(EUC-KR), BOM UTF-16 LE/BE 바이트 디코딩과 쉼표·탭·세미콜론·Excel `sep=` 구분자 인식.
- 공백·대소문자를 정규화한 보수적인 이름/ID 별칭, 임의 헤더, 반복되는 8~100개 범주의 온전한 A/B 배치.
- 표준 Excel 오류를 선택 컬럼의 `(미입력)`으로 보존하고 헤더별 개수를 알리는 경고. 이름/ID 오류는 명확히 거부.
- 자동 진행과 별도로 2~12개 게임 라운드, 라운드별 12~90초와 13종 게임을 선택하는 직접 설정. 예상 시간과 `ROUND x / N` 표시.
- 기어 회전체를 통과하는 **기어 캐스케이드**, 접촉한 발판이 사라지는 **브레이크어웨이** 물리 코스.
- 왕복 셔틀·피스톤·공전·스윙 장애물과 고정 물리 경로의 명시적 재생 시간 지원.

### Changed
- 직접 설정의 실제 게임 수는 참가자 `N`명에 대해 `min(요청 라운드, N-1)`이며 `N<=1`이면 0이다. 매 게임은 반드시 인원을 줄이고 마지막 게임에서 한 명을 만든다.
- 직접 설정 시간은 코스 재생 시간 그대로 적용하고 골인 확인 약 1.4초를 별도로 둔다. 짧은 설정은 같은 경로를 빠르게 재생하며 진행자의 대기는 합계에서 제외한다.
- 이름 공개 화면은 게임 수에 포함하지 않는다. 큰 인원의 균등 subset은 선택 코스를 가장하지 않고 익명 라이트 그리드로 표시한다.
- 진행 설정 변경은 확인 후 세션을 초기화한다. 일시정지와 재생 재시도는 이미 확정한 추첨 결과를 유지한다.
- 자동 shuffle bag은 그룹 게임 10종(물리 7종 + Canvas 3종)을 사용한다. 결선 물리 3종을 포함하면 전체 13종 중 10종이 Box2D다. 자동 모드의 자연스러운 최소 18/24초 동작은 유지한다.

### Data verification
- 저장소에 넣지 않은 188행 CP949 검수 파일에서 원본 7개 비식별 헤더가 모두 사용 가능했고, 앱 파생 `성씨 초성`을 포함해 설정에 8개 기준이 표시됐다.

### Verification
- 자동 테스트 58개와 물리 시작 조건 50/50 sweep 통과.
- 실제 CSV 188명 가져오기·필터, 4라운드 전체 진행, 지정 시간·골인/진출 일치, 접촉 발판 소멸, 일시정지, 설정 복원과 모바일 입력 검수 통과. [QA_v1.2](docs/QA_v1.2.md).
- 새 코스 동작은 참고 소스 commit `47230e3`의 맵 primitive와 접촉 발판 수명주기에서 영감을 받아 공정 추첨 구조에 맞게 구현했다.

## [1.1.0] - 2026-09-18

### Changed
- 초반 2.25~3배 가속 제거, 고정 물리 스텝 사이 좌표 보간, 결승 감속 0.58배·줌 1.6배 및 좌우 고정 카메라.
- 물리 골인 경로에 공정 추첨의 진출 대상을 시작 전에 연결. 경기 중 식별자는 고정하고 골인 기록과 진출 대상이 같아야 결과 적용.
- A·B 대표 공이 각 편의 그룹 전체를 대표하며, 결선은 선착순 4→2→1개의 개인 공이 진출.
- 좁은 벽 틈과 경사로·핀의 중첩을 해소하고, 정체 시 순간 속도 교체 대신 작은 물리 충격으로 복구.
- 기본 18초 이상 / 여유 24초 이상. 골인 확인을 1.4초 유지.
- 대기 화면의 추첨 대상 선택, 헤더 고유값 다중 선택, 값별·적용 예상 인원 및 전체 선택·해제.

### Verification
- 자동 검사 41개 통과. 골인/진출 일치·고정 식별자·경로와 인원수 독립·보간·다중 필터 회귀 포함.
- 실제 브라우저와 40개 코스 시작 조건의 검수: [QA_v1.1](docs/QA_v1.1.md).

## [1.0.1] - 2026-09-17

### Fixed
- 느린 화면에서 경과 시간이 버려져 연출이 늘어지거나 멈추는 문제 수정.
- 탭 전환·일시정지·초기 물리 로딩 후 시간 기준을 재설정하여 기다린 시간이 결과 공개를 앞당기지 않도록 수정.
- 큰 프레임 간격은 나누어 Box2D에 전달하고 화면은 한 번만 그려 고정 물리 스텝 유지.

### Verification
- 재생 회귀 검사 7개를 추가하여 자동 테스트 37개 통과. 실제 WASM의 600ms 프레임 간격 검사 포함.
- 검수 범위와 실제 브라우저 결과: [QA_v1.0.1](docs/QA_v1.0.1.md).

## [1.0.0] - 2026-09-17

### Changed
- 범용 **럭키드로우**로 재구성: 제목·소개·경품, 세 가지 매트 테마, 사용자 배경과 관객 화면.
- 이름만 필수인 CSV 모델과 임의 컬럼별 대상 선택. 누락값을 포함하는 완전한 그룹 분할, 중복 ID 검증.
- 8종 무작위 그룹 게임과 3종 결선; 이름은 10명 이하부터 공개.
- 기존 Web Crypto 인원비례 추첨은 유지하고, 오류/재시도에도 같은 확정 결과를 보존.
- 물리월드/임시 WASM 객체 수명 관리, 실제 진행도 기반 공개 대기 및 제한 시간 종료.
- 일시정지·효과음·움직임 줄이기, 이전 당첨자 제외, CSV/JSON 기록 저장.
- 기존 v0.7 원본 백업 및 과거 설계 기록 보존.

### Verification
- 자동 테스트 30개 통과 및 production build 확인. 실제 브라우저 검수의 범위와 증거는 docs/QA_v1.0.md에 기록.


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

## [0.7.0] - 2026-09-17

### Audit basis
- Re-audited the current `lazygyu/roulette` source at upstream commit `47230e3` as a motion-quality reference
- Identified the main v0.6 gap as course/map complexity, camera/time control, kinematic obstacles, and stuck recovery rather than Box2D availability itself
- Recorded the audit and acceptance metrics in `docs/PHYSICS_QA_v0.7.md`

### Added
- Premium Box2D course maps for all eight live Show Stages
- Stage-specific declarative physics map registry in `src/physics-stage-maps.js`
- 20~70+ collision entities per stage and rotating kinematic obstacles
- 10ms fixed physics step with Stage-specific early Fast Forward
- Camera follow with smooth vertical tracking and goal-zone zoom
- Goal-zone physical slow motion with Stage-specific minimum timeScale
- Short Marble motion trails and metallic sphere rendering
- Down-progress watchdog in addition to velocity-based stuck detection
- Recovery impulse toward the center channel and downward direction
- Course-mode UI that hides the central Roulette Dial while the physical race is running

### Changed
- `MOON ORBIT`, `FURNACE SPLIT`, `LAST GATE`, `SPOTLIGHT CUT`, and `TWIN ORBIT` moved from Canvas-only motion to Box2D
- `STEEL DROP`, `PINBALL GRID`, and `LAST MARBLE` maps were rebuilt as longer, denser courses rather than short obstacle demos
- Show timing changed from roughly 3~4 second effects to roughly 6~8 second physical courses, plus Header selection time
- Physics remains strictly downstream of the Web Crypto fair-draw decision and cannot change the selected Lane/final subset

### Live-duration physics QA
- STEEL DROP: progress `0.908`, zoom `1.633x`, min timeScale `0.356x`
- MOON ORBIT: progress `0.898`, zoom `2.083x`, min timeScale `0.257x`
- PINBALL GRID: progress `0.931`, zoom `1.929x`, min timeScale `0.300x`
- FURNACE SPLIT: progress `0.937`, zoom `2.199x`, min timeScale `0.250x`
- LAST GATE: progress `1.011`, zoom `2.719x`, min timeScale `0.240x`
- SPOTLIGHT CUT: progress `0.908`, zoom `1.797x`, min timeScale `0.340x`
- TWIN ORBIT: progress `1.013`, zoom `3.068x`, min timeScale `0.220x`
- LAST MARBLE: progress `0.900`, zoom `2.498x`, min timeScale `0.268x`

### Verification target
- Every live Stage: Premium Box2D
- Header Roulette remains non-physics UI selection
- Runtime exception: `0`
- Physics fallback warning: `0`
- Fairness engine contract unchanged
