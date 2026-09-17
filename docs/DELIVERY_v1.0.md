# 럭키드로우 v1.0 인수 안내

제품은 **럭키드로우**로 개편했으며 기존 GitHub 저장소와 Pages 주소를 유지합니다.

- 실행: https://01chungee10snu.github.io/chuseok-draw-show/
- 코드: https://github.com/01chungee10snu/chuseok-draw-show
- 사용 방법: [README](../README.md)
- 검수 근거: [QA_v1.0.md](QA_v1.0.md)

## 원래 목적과 반영 결과

CSV의 현재 참가자로 기준을 만들고 그룹 전체가 함께 응원합니다. 10명 이하에서 이름을 공개하고 마지막 한 명을 만나는 기존 목적을 유지했습니다. Web Crypto의 인원비례 선택과 결선 균등 추첨은 그대로 권위 있는 결과이며, 게임은 공개 연출입니다.

특정 회사·추석에 묶인 화면을 제목·소개·경품·색상·배경 설정으로 바꿨습니다. 매트한 차콜을 기본으로 페이퍼와 미드나이트를 제공합니다. 8종 무작위 그룹 게임과 3종 결선, 관객 화면, 일시정지, 움직임 줄이기, 당첨자 제외 및 기록 저장을 구현했습니다.

## 로컬 파일 안내

레포 루트: `/Users/01chungee10/Github/chuseok-draw-show`

| 경로 (레포 루트 기준) | 역할 |
|---|---|
| index.html · assets/styles.css · public/favicon.svg | output/current · 럭키드로우 화면 |
| src/app.js | output/current · 행사 설정, 명단, 추첨 진행, 기록 |
| src/lucky-draw-model.js | output/current · 새 범용 CSV/추첨 모델 |
| src/show-director.js | output/current · 새 게임 연출 관리자 |
| src/physics-show-engine.js · src/physics-stage-maps.js | output/current · 물리 코스와 복구 |
| tests/lucky-draw-model.test.mjs · tests/physics-show-engine.test.mjs | verification/current · 새 경계값 및 회귀 검사 |
| docs/qa-v1/ | verification/current · 실제 검수 화면 |
| docs/QA_v1.0.md · docs/DELIVERY_v1.0.md | verification/current · 검수와 인수 안내 |
| README.md · CHANGELOG.md · docs/DECISIONS.md | documentation/current · 사용 및 설계 변경 |
| docs/PHYSICS_QA_v0.7.md · docs/v07-*.png | reference/previous · 기존 v0.7 검수 기록 |
| public/data/demo_participants.csv | input/demo · 기존 합성 명단 240명 |

주요 파일의 전체 경로:
- `/Users/01chungee10/Github/chuseok-draw-show/src/app.js`
- `/Users/01chungee10/Github/chuseok-draw-show/src/lucky-draw-model.js`
- `/Users/01chungee10/Github/chuseok-draw-show/src/show-director.js`
- `/Users/01chungee10/Github/chuseok-draw-show/docs/QA_v1.0.md`

원본 백업: `/Users/01chungee10/Github/chuseok-draw-show-v07-backup-20260917.tgz` · input/original-v0.7. 수정 전 작업을 보존하며 Git 및 node_modules/dist는 제외한 압축본입니다.

## 작업 분담과 비용

CatDesk로 로컬 레포·기존 문서·검수 환경을 확인하고 결과를 반영했습니다. Chat On Steroids는 로컬 앱과 확장 프로그램의 버전 불일치로 요청이 전송·접수되지 않았습니다. 접수됐다고 간주하거나 COS가 작성한 결과 파일을 대신 만들지 않았습니다.

진행을 막지 않도록 가벼운 내부 작업자 한 명(gpt-5.6-sol)을 범용 모델·물리 오류의 제한된 구현/검수에 사용했고, Astra가 경험 설계, 통합, 실제 브라우저 검수와 최종 검토를 맡았습니다. 무제한 자동 루프·계정 업그레이드·유료 API 호출은 추가하지 않았습니다. 측정되지 않은 토큰 절감 수치는 제시하지 않습니다.

미전송 COS 요청 문서는 `/Users/01chungee10/AI-Interop/shared/LUCKY_DRAW_20260917_COS_TASK.md`에서 종료 상태로 표시했습니다. 추가 실행할 작업은 없습니다.
