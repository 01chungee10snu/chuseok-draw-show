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
