# Phase 4–5 및 프론트엔드

## 구현 범위

- Phase 4: 관심 종목 CRUD, 알림 조건 CRUD, 알림 이력 조회, Prisma migration.
- Phase 5: Bithumb Public WebSocket 한 연결에 활성 관심 종목과 활성 알림 종목의 합집합을 구독. 끊김 시 1/2/4/8/16/30초 backoff, ping/pong 검사, 재접속 시 DB 설정 복원.
- 프론트: React/TypeScript/Vite 대시보드, 6개 주기 캔들 차트, 실제 포트폴리오 조회, 관심 종목/알림 조건 관리, SSE 실시간 가격 표시, 모바일 레이아웃.
- 가격 도달 평가·cooldown 실행·Discord 발송은 **Phase 6 미구현**입니다. 지금 저장하는 cooldown/triggerOnce는 설정값입니다.

## 실행과 로그인

프로젝트 루트에서 `docker compose up -d --build --wait` 실행 후 http://127.0.0.1:3000 을 엽니다. 화면의 워크스페이스 연결에 `.env`의 `PORTFOLIO_API_TOKEN`을 입력합니다. Bithumb 키/시크릿은 입력하지 않습니다.

세션은 HttpOnly, SameSite=Strict 쿠키이며 8시간 유효합니다. 브라우저 localStorage/sessionStorage에 토큰을 저장하지 않습니다. Backend 재시작 시 다시 로그인합니다. 기존 CLI는 X-Monitor-Token 헤더를 계속 사용할 수 있습니다. 현재 인증은 같은 Mac의 loopback HTTP 사용을 전제로 합니다.

프론트 소스 index.html은 Vite 개발용입니다. 직접 file://로 열지 않습니다. 개발 시 Backend를 실행한 후 frontend에서 `npm ci && npm run dev`로 개발 서버를 엽니다. 프로덕션은 별도 프론트 컨테이너 없이 Backend가 빌드된 화면을 제공합니다.

## 컨테이너와 데이터

`crypto-backend`(React 정적 파일 + NestJS) → Docker 내부 `postgres:5432`. 두 컨테이너 모두 restart policy와 healthcheck를 사용합니다. DB는 기존 named volume을 유지하며 migration을 시작 시 적용합니다.

추가 테이블: watchlists, price_alerts, price_alert_logs. 기존 application_settings도 유지합니다. 알림 삭제 시 이력 FK는 NULL로 남겨 이력을 보존합니다. ticker와 candles는 DB에 저장하지 않습니다. 활성 설정은 메모리 캐시로 관리하고 CRUD/재접속/30초 복구 주기에서만 동기화합니다. ticker마다 DB를 조회하지 않습니다.

구독 변경은 기존 연결을 종료하고 새 합집합으로 연결합니다. 재연결하는 짧은 공백이 발생할 수 있습니다. 관심 종목을 삭제해도 활성 알림이 남아 있으면 구독을 유지합니다. 빈 목록이면 연결하지 않습니다.

## 추가 API

| 경로 | 기능 |
|---|---|
| GET/POST/DELETE /session | 세션 확인/로그인/로그아웃 |
| GET/POST /watchlist | 목록/추가 |
| PATCH/DELETE /watchlist/:id | 활성 상태 수정/삭제 |
| GET/POST /alerts | 목록/추가 |
| PATCH/DELETE /alerts/:id | 수정/삭제 |
| GET /alerts/logs | 최근 이력 최대 100개; Phase 5에서는 발생 기록 생성 없음 |
| GET /realtime | 연결 상태/구독/메모리 ticker |
| GET /realtime/stream | 인증된 브라우저에 1초 간격 SSE 상태 전달 |

시장 현재가는 구독 종목에 대해 실시간 갱신합니다. 캔들과 REST 24시간 변화율은 종목/주기 변경 또는 새로고침 시 갱신합니다. 관심 종목의 전일 대비는 거래소의 전일 종가 대비이며 최근 24시간 변화율과 다릅니다. 조회 불가능한 자산은 수량을 유지하고 전체 평가액/비중을 계산하지 않습니다.

## 검증

```sh
cd backend
npm ci
npm test
node test/market-live.cjs
node test/portfolio-live.cjs
node test/monitoring-live.cjs
# Backend 재시작과 DB 설정 복원까지 확인 (세션 재로그인 필요):
node test/monitoring-live.cjs --restart
cd ../frontend
npm ci
npx playwright install chromium
npm run build
npm run test:e2e
```

검증 결과: Backend 단위 테스트 41개, 브라우저 테스트 2개 통과. 실제 Bithumb REALTIME ticker 수신, SSE, 관심 종목 삭제 후 알림만으로 구독 유지, 활성 변경, Backend 재시작 후 설정 복원을 확인했습니다. 테스트가 만든 임시 레코드는 정리합니다. 미사용 테스트 종목이 없으면 실시간 테스트는 중단합니다. 포트폴리오 UI 테스트는 가상 데이터를 사용하고 실제 계좌 연결은 별도 portfolio-live 검증으로 확인합니다. 브라우저 trace/video는 비활성화하며 공개 화면 스크린샷만 test-results에 저장합니다.

24시간 연속 운영이나 Mac 재부팅 검증은 수행하지 않았습니다. Mac 잠자기나 Docker 종료 중에는 감시가 중단됩니다. 다음 단계는 Phase 6 AlertEngine, 중복 방지, Discord provider와 발송 이력 처리입니다.

## 주요 파일

- backend/prisma/schema.prisma 및 migrations/20260923010000_watchlist_alerts/
- backend/src/access/, state/, watchlist/, alert/, realtime/
- backend/src/bithumb/bithumb-websocket.client.ts
- backend/src/dashboard.controller.ts, main.ts, app.module.ts
- backend/test/monitoring.test.cjs, monitoring-live.cjs
- frontend/src/{main.tsx,Chart.tsx,types.ts,style.css}, tests/dashboard.spec.ts
- backend/Dockerfile, docker-compose.yml, .dockerignore

## 공식 WebSocket 문서

[Bithumb 기본 정보](https://apidocs.bithumb.com/reference/기본-정보), [요청 포맷](https://apidocs.bithumb.com/reference/요청-포맷), [현재가 ticker](https://apidocs.bithumb.com/reference/현재가-ticker), [연결 관리](https://apidocs.bithumb.com/reference/연결-관리)를 기준으로 구현했습니다.
