# 브리핑 기능 미리보기

고객 데모가 아닌 개발 QA 설명이다. 실제 모델 품질 검증 전에는 서비스 배포급으로
표시하지 않는다. 최신 구현 범위는 Screening 저장소의
`docs/GPT_BRIEFING_SERVICE_READINESS_KR.md`를 함께 확인한다.

기존 서체·색상으로 투자 브리핑과 공급망 역할 검토를 보여주는 로컬 개발 화면이다.
가상 기업과 mock 응답을 명확히 표시한다. 기본 화면과 운영 암호화 자산은 그대로다.

```powershell
npm ci
npm run dev:briefing
```

`http://127.0.0.1:4178/?demo=briefing`을 연다. 개발 서버와
`VITE_GPT_SHADOW_DEMO=true`, `?demo=briefing` 세 조건이 모두 있어야 열린다.
`npm run dev`의 기본값과 production build에는 기능이 없다. production에서 같은
환경변수를 설정해도 demo 분기는 개발 전용이며 실제 기능 진입점과 분리된다.
기본 OFF는 원래 entry를 그대로 사용한다. 명시적 `VITE_GPT_BRIEFING_ENABLED=true`
빌드에서는 `#/briefing`의 실제 암호화 reader가 활성화된다. 운영에는 켜지 않았다.

상황 선택으로 정상 변화, 오래된 Radar, 격리, 결측, 주요 변화 없음, 생성 실패를
비교한다. ‘투자 브리핑’에서 반대 근거·다음 확인·원문 기준을 펼친다.
‘공급망 역할 검토’에서는 기존 규칙과 다른 기업만 필터링하고 원문과 한계를 펼친다.
모든 역할 검토는 점수에 반영하지 않는다. ‘미확인’은 ‘사업 없음’을 뜻하지 않는다.

Python 저장소의 `scripts/build_gpt_shadow_demo.py`가 검증한 JSON만 fixture로 복사한다.
여기는 화면 표시만 담당하며 순위·점수를 다시 계산하지 않는다. production 데이터,
암호화 파일, journal, 비밀번호, API 키를 fixture나 public에 넣지 않는다.

```powershell
npm run test:briefing
npm run check
npm run test:browser -- --workers=2
python -m unittest discover -s tests -p test_pages_artifact.py
```

브라우저 회귀 테스트는 개발 서버를 사용하고 기존 합성 암호화 통합 테스트도 함께
실행한다. 320/390/1440px Chromium에서 주요 상호작용·오류·가로 넘침을 확인한다.
별도의 lint/typecheck 스크립트가 없는 JSX 저장소이므로 기존 check/build/test가 기준이다.

archive 입력 어댑터와 선택적 암호화 reader는 구현했으며 fake Responses 전송 결과를
공통 `BriefingView`에서 표시하는 경로를 검증한다. 실제 API·계정·운영 feed 게시·secret
주입과 모델 품질은 미검증이다. 생성 시각은 결과의 generated_at을 UTC로 표시하며,
실패는 생성되지 않음, 보존된 자료는 이전 결과와 실제 시각으로 표시한다.

## Linux에서 남은 기존 symlink 검증 재현

Node 24와 Python 3.12 이상의 Linux 환경에서 두 저장소를 같은 상위 폴더에 준비한다.
실제 API·키·배포 없이 다음만 실행한다. 아래의 경로 이름은 실제 clone 위치로 바꾼다.

```bash
cd screening-dev
python -m venv .venv
.venv/bin/pip install -e '.[dev]'
cd ../dashboard-dev
npm ci
export BRIEFING_TEST_BACKEND="$(cd ../screening-dev && pwd)"
export BRIEFING_TEST_PYTHON="$BRIEFING_TEST_BACKEND/.venv/bin/python"
npm run check
npm run test:browser -- --workers=2
"$BRIEFING_TEST_PYTHON" -m unittest discover -s tests -p test_pages_artifact.py
```

Windows에서는 기존 symlink 테스트 2개가 EPERM으로 남았다. skip하거나 권한을
바꾸지 않았다. Linux에서 실제 통과하기 전까지 이 항목은 미검증으로 남긴다.
renderer 통합 검사는 환경변수가 없으면 1개가 skip될 수 있으므로 위 두 변수를
명시하고 skipped=0인지 확인한다. 실제 API를 호출하는 스크립트는 이 절차에 없다.
