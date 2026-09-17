# CHUSEOK DRAW SHOW

현대제철 경영지원본부 추석 경품추첨을 위한 **정적 웹 프로토타입**입니다.

**Live prototype:** https://01chungee10snu.github.io/chuseok-draw-show/

## 핵심 원칙

- **실제 투입 CSV의 분포를 매 라운드 다시 읽어** 절단값/그룹을 동적으로 생성합니다.
- 두 Gate는 가능한 한 균형 있게 구성하되, 실제 Gate 선택은 **현재 Gate 인원수에 비례한 확률**로 수행합니다.
- 따라서 참가자 개인의 최종 당첨확률은 시작 시점 기준으로 동일한 `1/N`을 유지합니다.
- 실제 인사 CSV는 브라우저 메모리에서만 처리하며 저장소/서버로 전송하지 않습니다.
- 휴대폰 뒷자리 기반 규칙은 기본 비활성화합니다.

## 현재 프로토타입 · v0.5 Multi-Stage Group Show

![Round 1 — Steel Drop](./docs/stage-1.png)

초반에는 개인 이름을 사용하지 않습니다. 매 라운드 현재 생존자 데이터에서 **사용 가능한 Header를 다시 평가**하고, Header Roulette로 하나를 고른 뒤 해당 Header의 고유값을 2~7개 그룹으로 만들어 생존 경쟁을 진행합니다. 생존자가 5~10명에 도달하면 처음으로 Identity Reveal을 수행합니다.

각 라운드는 동일 애니메이션을 반복하지 않습니다.

| Stage | Show | 핵심 움직임 |
|---|---|---|
| Round 1 | **STEEL DROP** | 상단 마그넷 해제 → 수직 낙하 → Steel Gate |
| Round 2 | **MOON ORBIT** | 보름달 중심 궤도 → 궤도 축소 → Orbit Lock |
| Round 3 | **PINBALL GRID** | Peg 충돌 → 지그재그 낙하 → Slot Lock |
| Round 4 | **FURNACE SPLIT** | 컨베이어 이동 → 용광로 통과 → Steel Gate |
| Finalists→4 | **SPOTLIGHT CUT** | 다중 Spotlight → 생존자 집중 |
| 4→2 | **TWIN ORBIT** | 좌우 이중 궤도 → Final Two |
| 2→1 | **LAST MARBLE** | 두 Marble 직선 낙하 → Slow Motion → Winner |

![Identity Reveal preview](./docs/identity-reveal.png)

- 가상 참가자 CSV 240명
- 매니저 / 책임매니저 이상 2개 추첨 Pool
- Header Roulette: 매 라운드 다른 Header 자동 선정
- Categorical Header: 실제 고유값을 그대로 그룹으로 사용
- Numeric/Date Header: 현재 생존자 분포에 맞춘 동적 구간 생성
- 2~7개 Unique Value Group을 두 Survival Lane으로 균형 배치
- Lane 인원 비례 Weighted Draw로 개인 최종 확률 `1/N` 유지
- Group phase 동안 개인 이름 완전 비공개
- 자연스럽게 5~10명 도달 시 Identity Reveal
- Finalist 공개 후 균등 무작위 Final 4 → 2 → 1
- Round별 독립 Show Stage: STEEL DROP / MOON ORBIT / PINBALL GRID / FURNACE SPLIT
- Final별 독립 Show Stage: SPOTLIGHT CUT / TWIN ORBIT / LAST MARBLE
- Stage마다 배경 구조·Marble 궤적·긴장 구간·결정 문구·사운드 cue를 별도 적용
- Web Crypto 기반 난수
- 로컬 CSV 업로드
- 16:9 행사장 화면 중심 UI

## 실행

정적 파일이므로 저장소 루트에서 간단한 HTTP 서버만 띄우면 됩니다.

```bash
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173` 접속.

## 데이터 보안

실제 직원 CSV는 Git에 올리지 마십시오. `.gitignore`에서 실데이터 패턴과 `data/private/`, `data/real/`을 차단합니다.

프로토타입의 `data/demo_participants.csv`는 전부 가상 데이터입니다.

## 조작

- `SPACE`: 다음 라운드 / Final 진행
- `F`: 전체화면
- `R`: 현재 Pool 처음부터 재시작
- `AUDIT LOG`: CSV SHA-256, 각 라운드 Gate 인원/확률/생존자 수 확인

## 변경 이력

주요 설계 변경은 `CHANGELOG.md`, 의사결정은 `docs/DECISIONS.md`에 남깁니다.
