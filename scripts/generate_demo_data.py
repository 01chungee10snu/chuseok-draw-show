#!/usr/bin/env python3
import csv
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 20260917
N = 240
random.seed(SEED)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "demo_participants.csv"

SILS = {
    "인재경영실": ["컬처디자인팀", "인재개발팀", "인사운영팀", "HR기획팀"],
    "경영기획실": ["경영기획팀", "사업관리팀", "전략기획팀"],
    "재경실": ["재무팀", "회계팀", "세무팀"],
    "구매지원실": ["구매기획팀", "자재구매팀", "설비구매팀"],
    "총무지원실": ["총무팀", "업무지원팀", "자산관리팀"],
}

JOBS_BY_SIL = {
    "인재경영실": ["HR기획", "인사운영", "HRD", "조직문화"],
    "경영기획실": ["경영기획", "사업관리", "전략"],
    "재경실": ["재무", "회계", "세무"],
    "구매지원실": ["구매기획", "자재구매", "설비구매"],
    "총무지원실": ["총무", "업무지원", "자산관리"],
}

SURNAMES = list("김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심")
G1 = list("민서지현준성영수태재도하예주승우진상혜윤")
G2 = list("준현우진석민영수희연호빈원아윤경혁성지은")

ROLES = (
    [("일반", "팀원", "매니저")] * 150
    + [("일반", "팀원", "책임매니저")] * 60
    + [("일반", "팀장", "책임매니저")] * 15
    + [("임원", "실장", "상무")] * 8
    + [("임원", "본부장", "부사장")] * 7
)
random.shuffle(ROLES)


def rand_date(start: date, end: date) -> date:
    return start + timedelta(days=random.randint(0, (end - start).days))


def ranges(position: str):
    if position == "매니저":
        return date(1984,1,1), date(2002,12,31), date(2007,1,1), date(2026,6,30), (1,8)
    if position == "책임매니저":
        return date(1972,1,1), date(1992,12,31), date(1995,1,1), date(2021,12,31), (1,12)
    if position == "상무":
        return date(1967,1,1), date(1979,12,31), date(1990,1,1), date(2008,12,31), (1,6)
    return date(1963,1,1), date(1975,12,31), date(1987,1,1), date(2003,12,31), (1,6)


used_emp = set()
used_phone = set()
rows = []

for job_group, org_role, position in ROLES:
    while True:
        emp = str(random.randint(1_000_000, 9_999_999))
        if emp not in used_emp:
            used_emp.add(emp)
            break
    while True:
        phone = f"{random.randint(0, 9999):04d}"
        if phone not in used_phone:
            used_phone.add(phone)
            break

    sil = random.choice(list(SILS))
    team = random.choice(SILS[sil])
    b0,b1,j0,j1,yr = ranges(position)

    rows.append({
        "사번": emp,
        "본부": "경영지원본부",
        "실": sil,
        "팀": team,
        "성명": random.choice(SURNAMES) + random.choice(G1) + random.choice(G2),
        "직군": job_group,
        "조직상역할": org_role,
        "직위": position,
        "직위연차": random.randint(*yr),
        "직무": random.choice(JOBS_BY_SIL[sil]),
        "최초입사일": rand_date(j0,j1).isoformat(),
        "생년월일": rand_date(b0,b1).isoformat(),
        "휴대폰번호_뒷4자리": phone,
    })

OUT.parent.mkdir(parents=True, exist_ok=True)
with OUT.open("w", newline="", encoding="utf-8-sig") as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

print(f"generated={OUT}")
print(f"participants={len(rows)}")
print(f"seed={SEED}")
