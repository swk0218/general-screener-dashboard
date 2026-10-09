# RT-0023 표시 정확성과 호환 의존성 갱신

Radar 요약과 상세는 동일한 전달 packet과 hash로 결합된 engine status를
사용한다. 실패, 오래된 자료, 상태 미확인일 때 기준일 관측과 사유를 보이고
현재 경보처럼 강조하지 않는다. 열린 화면은 분 단위 및 탭 복귀 시 clock을
재평가한다. 이 표시 갱신은 재수집·재복호화·추가 네트워크 요청을 만들지 않는다.
잠금 이후 늦은 응답은 기존 generation guard를 따른다. packet, 수치, 모델
계약, ciphertext, 원장과 승인 metadata는 다시 쓰지 않는다.

합성 암호화 데이터를 사용해 320/390/1440px에서 요약→상세, quiet-stop,
실패·상태 누락, 시간 경과·탭 복귀, 잠금 및 가로 overflow를 검증한다.
기존 단위·Pages artifact·암호화·빌드 보안 시험도 유지한다.

RT-10은 baseline-browser-mapping, browserslist, nanoid, source-map-js의
간접 빌드 의존성과 browserslist 데이터만 기존 호환 범위에서 갱신한다.
사용자 입력이 이 빌드 API로 연결되는 경로는 확인되지 않았고, 직접적인
운영 침해가 재현된 것은 아니다. React/Vite major 강제 갱신이나 새 override를
추가하지 않는다. 잠금 파일 재설치, npm audit, 기존 빌드 및 브라우저 계약으로
호환성을 확인한다. advisory 세부 근거는 원 RT-0023 감사 inventory에 보존했다.
