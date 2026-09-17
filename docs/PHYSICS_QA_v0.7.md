# v0.7 Physics Show Quality Audit

Date: 2026-09-17

## 목적

v0.6은 Box2D를 실제로 사용했지만, 움직임의 품질이 기준 레퍼런스보다 현저히 낮았다. 이 문서는 `lazygyu/roulette`의 소스 구조를 품질 기준으로 다시 감사하고, v0.7에서 무엇을 수정했는지 검증한다.

중요: 원본 프로젝트의 추첨 결과 결정 방식을 이 앱에 가져오지 않는다. `CHUSEOK DRAW SHOW`의 생존자/당첨자는 기존 Web Crypto 기반 공정 추첨 엔진이 먼저 확정한다. Physics는 결과를 보여주는 Show Layer다.

## Reference Audit

Audit reference:

- upstream: `lazygyu/roulette`
- locally inspected upstream commit: `47230e3`
- license: MIT (`licenses/lazygyu-roulette-MIT.txt`)

관찰한 핵심 품질 요소:

- 4개 Stage 정의에 약 425개의 map entity 선언
- kinematic entity 약 56개
- circle 약 231개 / box 약 172개 / polyline 약 22개
- 약 10ms 단위의 고정 물리 update
- 선두/커트라인 Marble을 따라가는 Camera
- 결승 접근 시 Camera Zoom
- 결승 접근 시 `timeScale` 감소, 최저 약 `0.2x`
- Marble 정체 감지 및 shake/recovery
- 회전하는 kinematic obstacle
- particle / camera transform / winner presentation이 물리 loop와 하나의 연출 시스템으로 결합

이 수치는 특정 외형을 복제하기 위한 것이 아니라, 기존 v0.6의 품질 부족 원인을 파악하기 위한 구조적 기준으로 사용했다.

## v0.6에서 확인된 문제

v0.6은 다음 의미에서는 성공했다.

- Box2D WASM이 브라우저에서 실제 실행됨
- 실제 중력·충돌·반발이 동작함
- fair draw와 physics가 분리됨

그러나 Show 품질 기준에서는 부족했다.

- Box2D Stage가 3개뿐이었음
- 직접 작성한 충돌 구조가 대략 10개 box + 4개 circle 수준
- 짧은 3~4초 Stage
- Physics Camera 없음
- 목표 지점 기반 Zoom 없음
- Physics timeScale 없음
- 정체 watchdog 없음
- map이 짧아 '레이스'보다 '몇 개 장애물을 통과하는 애니메이션'에 가까웠음
- 중앙 Roulette Dial이 Physics Course보다 더 강한 시각적 주인공이었음

## v0.7 Quality Contract

### 모든 8개 Show Stage를 Box2D로 통일

1. `STEEL DROP`
2. `MOON ORBIT`
3. `PINBALL GRID`
4. `FURNACE SPLIT`
5. `LAST GATE`
6. `SPOTLIGHT CUT`
7. `TWIN ORBIT`
8. `LAST MARBLE`

Header 선택용 Roulette만 UI 애니메이션으로 유지한다.

### Stage별 물리 복잡도

| Stage | Entity | Kinematic | Course Height |
|---|---:|---:|---:|
| STEEL DROP | 33 | 3 | 46 |
| MOON ORBIT | 72 | 6 | 43 |
| PINBALL GRID | 62 | 5 | 50 |
| FURNACE SPLIT | 30 | 6 | 42 |
| LAST GATE | 31 | 5 | 42 |
| SPOTLIGHT CUT | 47 | 4 | 38 |
| TWIN ORBIT | 54 | 2 | 36 |
| LAST MARBLE | 32 | 2 | 41 |

각 Stage는 레일, peg, bumper, spinner, wall의 조합을 다르게 사용한다.

### Physics Runtime

- fixed physics step: `0.01 sec`
- early-course Fast Forward: Stage별 약 `2.25x ~ 3.00x`
- final-zone target timeScale: `0.20x ~ 0.30x`
- Camera follow: survivor Marble의 진행 위치를 smoothing하여 추적
- Camera Zoom: 결승 접근 시 Stage별 최대 `2.6x ~ 3.8x`
- Stuck watchdog: 단순 속도 정지뿐 아니라 **하강 진행이 없는 상태**도 감지
- Recovery impulse: 랜덤 방향이 아니라 **중앙 통로 + 아래 방향**으로 복구
- physical trail: Marble 이동 궤적을 짧은 trail로 표시
- central roulette dial: Physics Course 실행 중 숨김

## 행사 시간과 동일한 Duration QA

각 Stage를 실제 앱에서 사용하는 시간만큼 simulation한 결과다.

| Stage | Live Physics Duration | Max Progress | Max Camera Zoom | Min timeScale | Min Effective Rate | Max Effective Rate |
|---|---:|---:|---:|---:|---:|---:|
| STEEL DROP | 7.2s | 0.908 | 1.633x | 0.356x | 0.567x | 3.00x |
| MOON ORBIT | 7.6s | 0.898 | 2.083x | 0.257x | 0.388x | 3.00x |
| PINBALL GRID | 7.8s | 0.931 | 1.929x | 0.300x | 0.411x | 2.60x |
| FURNACE SPLIT | 7.2s | 0.937 | 2.199x | 0.250x | 0.334x | 3.00x |
| LAST GATE | 7.6s | 1.011 | 2.719x | 0.240x | 0.242x | 2.40x |
| SPOTLIGHT CUT | 6.0s | 0.908 | 1.797x | 0.340x | 0.466x | 2.30x |
| TWIN ORBIT | 6.5s | 1.013 | 3.068x | 0.220x | 0.220x | 3.00x |
| LAST MARBLE | 8.0s | 0.900 | 2.498x | 0.268x | 0.356x | 2.25x |

`Max Progress > 1`은 Marble이 goal line을 소폭 넘어간 상태를 의미한다.

### Acceptance

- all live stages use Box2D: PASS
- max progress >= 0.89: PASS (lowest `MOON ORBIT 0.898`)
- camera zoom becomes visible in every stage: PASS
- final slow-down becomes visible in every stage: PASS
- central Roulette Dial hidden during physics: PASS
- Web Crypto fair-draw result remains authoritative: PASS
- Box2D fallback changes winner: prohibited by architecture

## Runtime Flow QA

가상 Manager Pool 전체 주행에서 다음 흐름을 사용한다.

`Header Roulette → STEEL DROP → MOON ORBIT → PINBALL GRID → FURNACE SPLIT → optional LAST GATE → IDENTITY REVEAL → SPOTLIGHT CUT → TWIN ORBIT → LAST MARBLE`

QA 기준:

- no JavaScript runtime exception
- no physics fallback warning
- `Box2D.simd.wasm` loaded
- `course-mode` active for every live Show Stage
- Header Roulette remains separate from the physical course

## Fairness Boundary

Physics 결과와 추첨 결과를 결합하지 않는다.

```text
Header / Current Population
        ↓
Fair Draw Engine
(Web Crypto + population weighted Gate)
        ↓
Selected Lane / Final Subset LOCKED
        ↓
Premium Physics Show
(Box2D / camera / slow motion / collision)
        ↓
Reveal only
```

따라서 Map Geometry, restitution, friction, spinner, Fast Forward, Camera, stuck recovery를 변경해도 특정 개인의 당첨확률은 변하지 않는다.
