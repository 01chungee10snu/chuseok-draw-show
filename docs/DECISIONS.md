# Design Decisions

## D001 — 데이터 적응형 Round Planner

고정 절단값(예: 2000년 이후)을 쓰지 않는다. 실제 투입된 참가자와 매 라운드 현재 생존자의 분포를 읽어 절단값/범주 묶음을 다시 계산한다.

## D002 — 필터 자체가 실제 추첨이 되도록 유지

연출용 필터와 당첨자를 분리해 결과를 미리 정하는 방식 대신, 생성된 각 Gate의 인원수에 비례해 Gate를 추첨한다.

현재 생존자가 `N`, Gate g 인원이 `n_g`일 때 `P(g)=n_g/N`. Gate 안에서 이후 추첨이 계속 균등하게 유지되면 특정 개인 i의 최종 확률은 귀납적으로 `1/N`이다.

## D003 — Identity Reveal 범위

정확히 8명을 강제로 만들지 않는다. Header/Group 라운드가 자연스럽게 생존자를 줄이다가 `5~10명` 구간에 도달하는 순간 Identity Reveal을 수행한다. 그 전까지 개인 이름은 화면에 표시하지 않는다. 이후 Finalist만 대상으로 `→4→2→1` 균등 subset 추첨을 사용한다.

## D004 — 개인정보

실제 CSV는 브라우저 메모리에서만 읽는다. 서버 업로드/API 전송은 만들지 않는다. 저장소에는 가상 데이터만 둔다. 휴대폰 뒷4자리 원문은 화면에 표시하지 않고 해당 파생 규칙도 기본 비활성화한다.

## D005 — 프로토타입 기술

첫 버전은 순수 HTML/CSS/ES Module로 구현한다. 목적은 현장 템포와 가독성 검증이다. 물리엔진 도입 전에도 공정성 엔진과 show layer를 분리해 유지한다.

## D006 — Header → Unique Value Group

초반/중반 라운드의 주인공은 개인이 아니라 Header의 고유값 그룹이다. 매 라운드 현재 생존자 기준으로 사용 가능한 Header를 다시 평가한다. 범주형은 실제 고유값 `2~7개`를 그대로 그룹으로 사용하고, 수치/날짜형은 현재 분포를 바탕으로 `2~6개` 동적 구간을 만든다. 동일 Header는 한 추첨에서 재사용하지 않는다.

## D007 — Group Lane 공정성

고유값 그룹 전체를 빠짐없이 두 개 Survival Lane으로 배치한다. 각 Lane이 포함한 실제 인원수를 `n_A`, `n_B`, 현재 생존자를 `N`이라 하면 `P(A)=n_A/N`, `P(B)=n_B/N`으로 선택한다. 선택 Lane 안에서 후속 추첨이 균등하면 특정 개인의 최종확률은 `n_g/N × 1/n_g = 1/N`으로 유지된다. 물리/애니메이션은 이 결과를 공개하는 show layer로만 사용한다.

## D008 — Round별 독립 Show Stage

Header와 고유값 그룹은 데이터에 의해 동적으로 바뀌지만, 행사 전개는 라운드마다 명확히 다른 체험을 제공한다. Group Round 1~4는 각각 `STEEL DROP`, `MOON ORBIT`, `PINBALL GRID`, `FURNACE SPLIT`을 사용한다. Final은 `SPOTLIGHT CUT → TWIN ORBIT → LAST MARBLE` 순으로 별도 연출한다. 각 Stage는 배경 구조, 그룹 이동 궤적, 긴장 단계 문구, 사운드 cue를 독립적으로 가진다. 단, 어떤 Stage도 추첨 결과를 결정하지 않으며 공정 추첨 엔진이 이미 결정한 결과만 공개한다.

## D009 — Box2D는 Show-only Physics Layer

`STEEL DROP`, `PINBALL GRID`, `LAST MARBLE`은 `box2d-wasm`으로 실제 중력·충돌·반발 물리를 계산한다. 그러나 Box2D의 골인 순서나 충돌 결과는 생존자/당첨자를 결정하지 않는다. 생존 Lane 또는 Final subset은 기존 Web Crypto 기반 공정 추첨 엔진이 먼저 확정하고, 물리엔진은 그 확정 결과를 공개하는 시각 레이어로만 동작한다. 물리 초기화 또는 렌더링 실패 시 Canvas fallback으로 전환하더라도 추첨 결과는 변하지 않는다.

## D010 — Production은 Vite dist + GitHub Actions Pages

Box2D WASM을 외부 CDN 없이 행사 페이지와 함께 배포하기 위해 production은 Vite로 빌드한다. GitHub Pages에는 저장소 루트가 아니라 `npm test`와 `npm run build`를 통과한 `dist/` artifact만 배포한다. 실제 HR CSV는 build input이나 `public/`에 포함하지 않으며, `public/data/demo_participants.csv`만 합성 데모 데이터로 허용한다.

## D011 — Physics Quality는 Engine 유무가 아니라 Runtime System으로 판정

`Box2D를 사용한다`는 사실만으로 Show 품질을 충족했다고 판단하지 않는다. v0.7부터 Physics Stage는 긴 연속 코스, 충분한 static/kinematic map entity, 회전 장애물, fixed physics step, Camera Follow/Zoom, 결승 timeScale, stuck/progress watchdog을 하나의 품질 계약으로 가진다. 이 요소들이 실제 live-duration 안에서 동작하는지를 runtime QA로 확인해야 한다.

## D012 — Early Fast Forward → Final Slow Motion

긴 코스를 행사 템포 안에 넣기 위해 Stage 초반은 약 `2.25~3.00x`의 물리시간으로 진행한다. Marble이 결승 구간에 접근하면 Fast Forward를 제거하고 Stage별 `0.20~0.36x` 수준까지 timeScale을 낮추며 Camera Zoom을 동시에 적용한다. 이 속도 조절은 Show 시간에만 영향을 주며 Fair Draw 결과에는 영향을 주지 않는다.

## D013 — Physics Course 중 Roulette Dial 비노출

Header를 선택하는 단계에서는 Roulette UI를 사용하지만, Physics Course가 시작된 뒤에는 중앙 Roulette Dial을 숨긴다. 실제 코스, Marble, 회전 장애물, Camera 이동이 화면의 주인공이 되어야 하며 Roulette Dial이 물리경기보다 강한 시각적 위계를 가져서는 안 된다.


## D014 — 범용 행사와 그룹 응원 (v1.0)

제품명은 럭키드로우로 통일하고 행사명·설명·경품·화면 테마와 이미지 배경을 설정으로 분리한다. 처음부터 개인 이름을 경쟁시키지 않고, 현재 참가자의 컬럼으로 그룹을 만들고 같은 편을 함께 응원하는 기존 목적을 보존한다. 이름 하나만 있는 명단도 허용한다. D003의 공개 경계는 모든 소규모 명단을 다루기 위해 1~10명으로 확장한다.

## D015 — 현재 배포 버전의 무대 순서 (D008 대체)

그룹 무대는 5종 물리 코스와 3종 다른 움직임의 게임, 총 8종 shuffle bag으로 선택한다. 이전 버전의 라운드별 고정 순서와 5라운드 이후 반복은 폐기한다. 결선은 단계별 3종 물리 코스를 유지한다. 무대 선택 난수는 생존 편/개인 추첨과 별도 호출이며 연출에는 추첨 결과를 입력하지 않는다.

## D016 — 완전한 분할과 확정 결과 보존

빈 값도 별도 그룹으로 포함하고, 수치 구간에서 동일값을 분리하지 않는다. 균형 잡힌 기준이 없으면 현재 참가자 중 10명을 균등 선택한다. 단계 결과는 연출 전 한 번 확정한다. 재생 실패 시 pending 결과를 보존하고 같은 연출을 재시도한다. 추첨 결과 공개는 연출 완료 이후에만 적용한다.

## D017 — 행사 운영과 범위

당첨자를 수동으로 확인하며 한 명씩 진행하고, 같은 명단의 이전 당첨자는 기본 제외한다. 참가자/당첨 기록은 자동으로 영구 저장하지 않고 CSV와 감사 JSON으로 명시적으로 내보낸다. 외부 이미지·음원 호출 없이 동작한다. 배경을 선택하면 해당 파일을 브라우저에서만 사용한다. 움직임 줄이기는 물리 코스 대신 정적 공개 연출을 사용하며 결과는 동일하다.

## D018 — 원본 v0.7 보존 및 검수 정정

기존 작업트리는 /Users/01chungee10/Github/chuseok-draw-show-v07-backup-20260917.tgz로 먼저 보존했다. 실제 재실행 결과 기존 테스트는 14/15였고 steel-drop의 entity 수가 기준에 못 미쳤다. 대칭 입구 bumper를 추가하고 실제 Box2D 반복 시작/정리까지 검증했다. v0.7 문서의 당시 주장과 v1.0 검증 결과를 혼동하지 않는다.


## D019 — 트윈 코스 출입구와 레인별 복구

실제 네 명 결선에서 원형 장애물 내부에 공이 갇히는 사례를 재현했다. 각 링의 위·아래 출입구와 중앙 벽 간격을 확보하고, 정체 복구가 전체 코스 중심 대신 자기 레인의 중심을 향하도록 수정했다. 순간이동이나 추첨 결과에 따른 경로 조정은 사용하지 않는다. 정확한 재현 참가번호를 실제 WASM 테스트로 고정했다.
