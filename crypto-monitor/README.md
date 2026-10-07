# Bithumb Crypto Monitor — Phase 8 + Frontend

개인 Mac에서 운영하는 모니터링 앱입니다. AI 요약 설정과 사용법은 [Phase 8 안내](./PHASE8.md)를 참고하세요. **현재 구현 범위는 Phase 1–8과 React 프론트엔드입니다.** 시장·차트·포트폴리오 조회, 관심 종목/알림 조건 관리, 실시간 WebSocket 구독을 제공합니다. 가격 도달 판단·중복 방지·Discord 발송과 기술적 지표를 제공합니다. [Phase 7 안내](./PHASE7.md)를 참고하세요. [Phase 6 안내](./PHASE6.md)를 참고하세요. 주문·출금 기능은 없습니다.

화면은 **http://127.0.0.1:3000** 에서 엽니다. `frontend/index.html`을 파일로 직접 열지 마세요. 로그인에는 `.env`의 `PORTFOLIO_API_TOKEN`을 사용합니다. [Phase 4–5 실행·검증 안내](./PHASE4-5.md)를 참고하세요.

Phase 2 API 사용법, 응답 단위, 공식 문서와 검증 명령은 [PHASE2.md](./PHASE2.md)를 참고하세요.

Phase 3 키 설정, 로컬 접근 토큰, 포트폴리오 계산·미평가 자산 처리와 검증은 [PHASE3.md](./PHASE3.md)를 참고하세요. 로컬에서 `node backend/scripts/portfolio.cjs`로 현재 포트폴리오를 조회할 수 있습니다.

## 구조

```text
Mac 127.0.0.1:3000
  └─ crypto-backend (React 정적 화면 + Node.js 22 / NestJS / Prisma)
       └─ postgres:5432 (PostgreSQL 17, Docker 내부 전용)
            └─ crypto-monitor_crypto_postgres_data (named volume)
기존 n8n: 독립적인 기존 컨테이너, 변경 없음
```

두 서비스 모두 `restart: unless-stopped`와 healthcheck를 사용합니다. PostgreSQL은 호스트 포트를 공개하지 않아 기존 DB와 5432 포트가 충돌하지 않습니다. Backend의 호스트 포트만 `BACKEND_PORT`로 변경할 수 있습니다. Docker 로그는 서비스당 10 MB × 3개로 순환합니다.

## 실행

Docker Desktop을 실행한 상태에서 프로젝트 디렉터리로 이동합니다.

```sh
cd "/Users/johnhan/Documents/ChatGPT/New project/crypto-monitor"
```

이 작업 환경에는 무작위 비밀번호가 담긴 로컬 `.env`가 이미 생성되어 있습니다. 새 환경에서는 다음을 한 번 수행합니다.

```sh
cp .env.example .env
openssl rand -hex 32
chmod 600 .env
```

생성된 문자열을 `.env`의 `POSTGRES_PASSWORD`에 입력합니다. 예제 placeholder 그대로는 실행하지 않습니다. `DATABASE_URL`의 `${POSTGRES_PASSWORD}`는 Docker Compose가 확장합니다. 영문·숫자 비밀번호를 권장하며, 특수문자를 사용할 경우 URL의 비밀번호 부분은 percent encoding해야 합니다. API 키는 Phase 1에서 비워 둡니다.

```sh
docker compose up -d --build --wait
docker compose ps
curl --fail-with-body http://127.0.0.1:3000/health
```

예상 결과:

```json
{"status":"ok","database":"up","timestamp":"2026-09-23T00:00:00.000Z"}
```

`/health`는 Prisma를 통해 `application_settings` 테이블을 조회합니다. 연결 또는 테이블이 없으면 HTTP 503과 `database: down`을 반환합니다. 실제 비밀번호, URL, DB 오류 원문은 응답에 포함하지 않습니다.

```sh
docker compose logs --tail=100 crypto-backend
docker compose exec crypto-backend npm run db:status
docker compose exec postgres psql -U crypto -d crypto_monitor -c 'SHOW timezone;'
```

Backend 시작 순서는 환경변수 검증 → `prisma migrate deploy` → NestJS 시작 → Prisma 연결입니다. migration 실패 시 Backend는 시작하지 않고 종료하여 restart policy로 재시도합니다. DB healthcheck 통과 후 Backend가 시작됩니다.

## 파일과 모듈

- `docker-compose.yml`: 격리된 두 서비스, named volume, healthcheck, 로컬 포트 바인딩.
- `.env.example`, `.gitignore`: 설정 예제와 secret 제외. `.env`는 로컬 전용입니다.
- `backend/Dockerfile`, `.dockerignore`: 다단계 빌드, non-root Node 실행, secret 빌드 제외.
- `backend/package.json`, `package-lock.json`, `tsconfig.json`: 의존성 고정 및 빌드/검증 명령.
- `backend/src/config/`: 필수 DB URL, PORT, NODE_ENV, TZ 및 선택 외부 설정 검증.
- `backend/src/database/`: Prisma 생명주기, 연결 및 readiness 조회.
- `backend/src/health/`: `/health` endpoint.
- `backend/src/app.module.ts`, `main.ts`: 앱 조립과 종료 신호 처리.
- `backend/scripts/start.cjs`: 값이 포함된 원문 오류를 출력하지 않는 시작/migration wrapper.
- `backend/prisma/`: 스키마와 최초 migration.
- `backend/test/foundation.test.cjs`: 설정 검증·secret 비노출 및 health 상태 테스트.
- `backend/test/docker-smoke.cjs`: DB 중단·복구와 컨테이너 재생성 후 데이터 유지 통합 검증.

Prisma만 ORM으로 사용합니다. Phase 1 초기 migration은 향후 애플리케이션 설정을 위한 `application_settings`만 생성합니다. Prisma의 `_prisma_migrations`는 migration 관리 테이블입니다. ticker/candle/잔고 테이블은 만들지 않습니다. 관심 종목과 알림 등 업무 테이블은 해당 Phase에서 추가합니다.

DB 세션은 UTC이며 timestamp 컬럼은 `TIMESTAMPTZ`입니다. Backend의 기본 출력 시간대 설정은 `Asia/Seoul`이고 health timestamp는 ISO UTC입니다.

## 개발 및 migration

```sh
cd backend
npm ci
npm run prisma:generate
npm test
```

Prisma 6.19.0을 client와 CLI에 동일하게 고정했습니다. 보안 수정된 `effect`, `deepmerge-ts`를 overrides로 지정했습니다. 의존성 변경 시 generate, 테스트, migration, 실제 연결을 다시 검증해야 합니다.

새 migration을 만들 때 schema를 수정한 뒤 개발용 PostgreSQL에서 실행합니다. `migrate dev`는 운영 DB에 실행하지 않습니다. 현재 운영 DB는 호스트에 공개하지 않으므로 별도 개발 DB를 준비합니다.

```sh
# DATABASE_URL을 별도 개발 DB URL로 설정한 쉘에서:
npm run db:migrate -- --name describe_change
```

생성된 `prisma/migrations`를 버전 관리하고 이미 적용된 migration 파일은 수정하지 않습니다. 배포 시 이미지 재빌드 후 `migrate deploy`가 미적용 migration만 반영합니다. 컨테이너 안에서 migration 파일을 생성하면 호스트에 남지 않으므로 호스트의 backend 폴더에서 개발합니다.

## 데이터 유지 및 장애 확인

`docker compose down`은 컨테이너와 네트워크를 제거하지만 named volume은 유지합니다. **`docker compose down -v`, volume 삭제, Docker Desktop 데이터 초기화는 DB 데이터를 삭제합니다.** 볼륨은 백업의 대체 수단이 아닙니다.

DB 중지 테스트는 이 프로젝트 DB에만 영향을 줍니다.

자동 검증은 프로젝트 루트에서 `node backend/test/docker-smoke.cjs`로 실행합니다. 두 컨테이너를 잠시 중지·재생성하므로 유지보수 시간에만 실행합니다. 테스트용 설정 레코드는 확인 후 삭제합니다.

```sh
docker compose stop postgres
curl -i http://127.0.0.1:3000/health
docker compose start postgres
curl -i http://127.0.0.1:3000/health
```

중지 시 503, 재시작 완료 후 200이 예상됩니다. Docker의 `unhealthy` 표시는 그 자체로 컨테이너를 재시작하지 않습니다. 프로세스 종료 시 restart policy가 작동합니다.

## 운영상 주의 및 문제 해결

- Docker daemon 접근 실패: Docker Desktop 실행 여부와 Docker 접근 권한을 확인합니다.
- 포트 충돌: `.env`의 `BACKEND_PORT`를 바꾼 후 `docker compose up -d`를 실행합니다.
- 초기 이미지 다운로드 실패: Docker Hub/npm 접속, 프록시, 디스크 여유 공간을 확인합니다.
- DB 인증 실패: 기존 volume 생성 때 설정된 비밀번호와 `.env`가 일치해야 합니다. 환경변수만 바꿔도 기존 DB 비밀번호는 변경되지 않습니다. 기존 데이터를 지우는 대신 관리 절차로 비밀번호를 변경합니다.
- migration 실패: 로그는 민감정보 보호를 위해 일반 메시지만 표시합니다. `db:status`와 migration 파일을 확인하며, CLI 출력이나 `docker compose config` 전체를 공유하면 접속 정보가 노출될 수 있습니다.
- Mac 잠자기·재부팅·Docker Desktop 종료 동안에는 실행되지 않습니다. 24시간 운영에는 Mac 자동 잠자기 방지, 전원 연결, 로그인 후 Docker Desktop 시작 설정이 필요합니다. 이번 작업은 시스템 전원 설정을 변경하지 않습니다.
- API는 Mac loopback 포트로만 공개합니다. `/portfolio`는 별도의 `X-Monitor-Token`을 검증하고 응답 캐시를 금지합니다. health와 공개 시세 API는 토큰 없이 조회할 수 있습니다. 인터넷 공개용 다중 사용자 인증은 범위에 포함하지 않습니다.
- n8n 컨테이너의 `localhost`는 n8n 자신입니다. Phase 9에서 Docker 네트워크와 인증을 별도로 구성합니다. 현재 기존 n8n 네트워크와 설정은 변경하지 않습니다.

## 후속 단계

### Phase 1 실측 검증 결과 (2026-09-23)

- Docker build 및 `up --wait` 성공, 두 서비스 모두 healthy.
- Mac에서 `/health` HTTP 200 및 `database: up` 확인.
- 초기 migration 1개 적용 및 migration status up to date 확인.
- PostgreSQL timezone UTC 확인.
- 단위 테스트 4개 통과, 설치/build 시 npm audit 보고 0건.
- DB 중단 시 HTTP 503, DB 재시작 후 기존 Backend에서 HTTP 200 복구 확인.
- 두 컨테이너 강제 재생성 후 임시 레코드 유지 확인, 테스트 레코드 삭제 완료.
- PostgreSQL connected / Application started 로그 확인.
- 기존 n8n은 계속 실행 중이며 설정 변경 없음.

24시간 연속 운영 테스트와 Mac 재부팅 후 Docker Desktop 자동 시작은 이번 검증에 포함하지 않았습니다.

Phase 2는 BithumbModule, BithumbRestClient, MarketModule/Service, 시장 이름 정규화, ticker·candle 조회를 구현했습니다. 외부 API 호출은 BithumbModule에 한정하며 DB에 시세를 복제하지 않습니다.

Phase 6 Discord 알림까지 구현했으며, 이후 Phase 7 지표 → Phase 8 AI → Phase 9 n8n 순서입니다. Phase별 사용자 지시 후 진행합니다.

참고: [NestJS 배포 및 health 안내](https://docs.nestjs.com/deployment), [Prisma Docker 가이드](https://docs.prisma.io/docs/guides/deployment/docker). 버전별 Prisma 명령 차이가 있으므로 이 프로젝트의 고정 버전 및 npm scripts를 기준으로 실행합니다.
