# 브리핑 기능 미리보기

기존 서체·색상으로 투자 브리핑과 공급망 역할 검토를 보여주는 로컬 개발 화면이다.
가상 기업과 mock 응답을 명확히 표시한다. 기본 화면과 운영 암호화 자산은 그대로다.

```powershell
npm ci
npm run dev:briefing
```

`http://127.0.0.1:4178/?demo=briefing`을 연다. 개발 서버와
`VITE_GPT_SHADOW_DEMO=true`, `?demo=briefing` 세 조건이 모두 있어야 열린다.
`npm run dev`의 기본값과 production build에는 기능이 없다. production에서 같은
환경변수를 설정해도 `import.meta.env.DEV` 분기가 제거되므로 데모가 포함되지 않는다.

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

실제 GPT 호출, archive 입력 어댑터, 선택적 암호화 브리핑 feed 연결은 아직 하지 않았다.
실제 B2C 화면의 진입점·로그인·현재 자료 freshness는 운영 연결 단계에서 별도 검증한다.
이번 데모는 로그인 우회가 아니며 실제 운영 자료를 요청하거나 표시하지 않는다.
