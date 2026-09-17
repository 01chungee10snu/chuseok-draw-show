# 럭키드로우 v1.0.1 재생 검수

검수일: 2026-09-17. v1.0.0 (`062dd6d`)에 이어 재생 시간 처리를 수정한 패치입니다. 기존 화면·행사 설정·CSV·공정 추첨의 전체 검수는 [v1.0 검수](QA_v1.0.md)에 있습니다.

## 문제와 수정

기존 코드는 프레임 간격이 0.5초를 넘으면 경과 시간을 0으로 처리했습니다. 간격이 0.1초인 경우에도 0.05초만 반영해 연출이 늘어졌습니다. 느린 화면에서는 물리 코스와 결과 공개가 진행되지 않을 수 있었습니다.

- 화면이 보이는 동안은 프레임당 최대 1초까지 경과 시간을 반영합니다. 더 긴 멈춤을 한 번에 따라잡지는 않습니다.
- Box2D에는 최대 1/60초씩 나누어 전달하고 한 번 그립니다. 엔진의 10ms 고정 물리 스텝과 감속은 유지합니다.
- 탭 표시 상태 변경, 일시정지·재개, 초기 물리 로딩 완료 시 시간 기준을 다시 잡습니다. 숨겨졌거나 기다린 시간을 다음 프레임에 더하지 않습니다.
- 숨겨진 탭에서는 효과음을 새로 재생하지 않으며, 연출 관리자 해제 시 추가한 이벤트도 제거합니다.

이 수정은 추첨 입력·난수·가중치·확정 결과를 변경하지 않습니다.

## 자동 검사

새 회귀 검사 7개가 수정 전 **0 PASS / 7 FAIL**, 수정 후 **7 PASS / 0 FAIL**이었습니다. 전체 **37 PASS / 0 FAIL**, Mac production build **PASS**입니다.

| 조건 | 확인 결과 |
|---|---|
| 100ms / 600ms 프레임 간격 | 12초 연출이 해당 프레임 간격의 오차 안에서 완료 |
| 수동 일시정지·재개 | 경과 시간 유지, 첫 재개 프레임에서 기다린 시간 제외 |
| 숨겨진 탭 및 프레임이 아예 없던 탭 복귀 | 진행 유지, 대기 결과를 갑자기 공개하지 않음 |
| 비동기 물리 로딩 | 로딩 시간을 연출 시간에서 제외 |
| 화면 표시 중 60초 멈춤 | 최대 1초만 진행, 즉시 결과 공개 없음 |
| 실제 Box2D 트윈 레이스 · 600ms 프레임 | 진행도 0.985 이상, 19초 제한 전 정상 완료 |

재현 명령: `npm test`. 회귀 검사는 `tests/show-director.test.mjs`에 있습니다. 제어한 시간·표시 상태로 실제 ShowDirector를 실행하며 그림 그리기만 생략합니다. 물리 회귀 사례는 실제 SIMD WASM을 사용합니다.

## 실제 Mac Chrome 검사

합성 명단 240명으로 실행했습니다. 검수 페이지의 requestAnimationFrame 전달 간격을 600ms 이상으로 제한했습니다. 앱 코스·그림·추첨은 실제 코드를 사용했습니다.

| 조건 | 무대 | 참가자 변화 | 연출 시간 | 물리 최대 진행도 | 완료 |
|---|---|---|---:|---:|---|
| 느린 프레임 + 일시정지 | 스윙 게이트 | 240 → 108 | 12.58초 | 1.00833 | completed |
| 일반 프레임으로 복귀 | 오비트 랠리 | 108 → 55 | 12.03초 | 해당 없음 | completed |

스윙 게이트의 실제 관측 시간은 15.009초로, 1.504초의 일시정지와 프레임 대기·검사 간격을 포함합니다. 정지 중 참가자 수 240명과 물리 진행도 0.53510이 유지됐고, 결과 기록도 증가하지 않았습니다. 재개 후 각 무대의 `show_finished`는 한 번씩 기록됐습니다. 미처리 JavaScript 예외는 0개였습니다.

원시 결과: [playback-v1.0.1.json](qa-v1/playback-v1.0.1.json). Chrome 검수 페이지의 프레임 제한은 검사 종료 후 해제했습니다. 탭 표시 상태 변경은 위 자동 검사에서 검증했습니다. 이 패치에서 Safari·Firefox 또는 실제 행사 프로젝터 검사는 추가 수행하지 않았습니다.

## 변경 파일과 보존

기존 로컬 레포를 제자리 수정했습니다. 기준본 v1.0.0은 Git의 `062dd6d`에 남아 있으며, 기존 v0.7 백업도 유지합니다. 별도 앱 복사본은 만들지 않았습니다.

레포 루트: `/Users/01chungee10/Github/chuseok-draw-show`

| 전체 경로 | 역할·처리 |
|---|---|
| `/Users/01chungee10/Github/chuseok-draw-show/src/show-director.js` | output/current · 재생 시간 수정 |
| `/Users/01chungee10/Github/chuseok-draw-show/src/app.js` | output/current · 감사 기록 버전 변경 |
| `/Users/01chungee10/Github/chuseok-draw-show/package.json` | output/current · 버전 1.0.1 |
| `/Users/01chungee10/Github/chuseok-draw-show/package-lock.json` | output/current · 루트 패키지 버전 동기화 |
| `/Users/01chungee10/Github/chuseok-draw-show/tests/show-director.test.mjs` | verification/current · 새 회귀 검사 |
| `/Users/01chungee10/Github/chuseok-draw-show/docs/QA_v1.0.1.md` | verification/current · 새 검수 기록 |
| `/Users/01chungee10/Github/chuseok-draw-show/docs/qa-v1/playback-v1.0.1.json` | verification/current · 새 브라우저 측정 결과 |
| `/Users/01chungee10/Github/chuseok-draw-show/README.md` | documentation/current · 사용 동작 및 검수 링크 갱신 |
| `/Users/01chungee10/Github/chuseok-draw-show/CHANGELOG.md` | documentation/current · 패치 이력 추가 |
| `/Users/01chungee10/Github/chuseok-draw-show-v07-backup-20260917.tgz` | input/original-v0.7 · 기존 백업 유지 |

폴더별 변경: `src/` 재생·버전, `tests/` 회귀 검사, `docs/` 검수 문서와 `qa-v1/` 측정 결과, 루트의 패키지·사용 안내·변경 이력입니다.
