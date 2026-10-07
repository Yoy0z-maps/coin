# Phase 6 — 가격 알림과 Discord

활성 알림을 메모리에서 평가하고 조건 충족 시에만 DB에 접근합니다. ABOVE/BELOW는 경계값을 포함합니다. 새로 등록하거나 재연결했을 때 이미 조건을 만족한 최신 ticker도 알립니다. 거래소 timestamp가 60초 넘게 오래된 ticker는 제외합니다.

DB transaction에서 조건 버전과 마지막 발생 시각을 비교해 알림 발생을 선점하고 PENDING 이력을 함께 기록합니다. 1회 알림은 비활성화하고 반복 알림은 발생 시각부터 cooldown을 적용합니다. 사용자 수정/삭제나 동시 처리로 오래된 캐시가 된 경우에는 발송하지 않습니다. ticker마다 DB를 조회하지 않으며 DB 실패 시 해당 알림의 재시도는 30초 대기합니다.

Discord 웹후크는 .env의 DISCORD_WEBHOOK_URL에 설정하고 `docker compose up -d --build --wait`로 반영합니다. 미설정 상태에서는 알림을 소비하지 않습니다. 설정 URL이나 응답 원문은 로그에 기록하지 않습니다. 메시지는 현재가, 조건, 전일 종가 대비 변화율, KST 시각을 포함합니다. 전일 종가 대비는 최근 24시간 변화율이 아닙니다.

NotificationProvider 인터페이스로 채널 구현을 분리합니다. Discord 요청은 순차 처리하고 allowed_mentions를 비워 멘션을 차단합니다. wait=true 응답의 메시지 ID로 발송을 확인합니다. 429만 retry_after에 따라 최대 3회 시도하며 긴 제한/타임아웃/기타 오류는 실패로 남깁니다. 대기열은 최대 100개입니다.

## 발송 이력과 장애 의미

가격 알림 화면에 최근 100개 발생 이력과 SENT/FAILED/PENDING 상태를 표시합니다. 화면 설정과 이력은 10초마다 갱신합니다.

- SENT: Discord 서버가 메시지 생성을 확인했습니다. 휴대폰 푸시 수신은 기기·채널 알림 설정에 따라 다릅니다.
- FAILED: 발송 실패 또는 수신 확인 실패입니다. 타임아웃이면 실제 메시지는 도착했을 수도 있습니다.
- PENDING: 처리 중입니다. DB 선점 이후 프로세스 중단 또는 결과 저장 실패가 있었다면 확인 필요 상태로 남습니다.

Discord와 DB를 하나의 원자적 transaction으로 묶을 수 없으므로 정확히 한 번 전달을 보장하지 않습니다. 불확실한 발송은 자동 재전송하지 않습니다. 실패해도 1회 알림은 정지 상태이며 반복 알림은 cooldown을 유지합니다. 사용자가 다시 활성화하면 lastTriggeredAt을 초기화해 재무장합니다. 정지 후 재개하면 조건 충족 시 즉시 새 알림이 발생할 수 있습니다.

## 검증

`cd backend && npm test`: 조건 경계, cooldown, 동시 ticker 중복 방지, 미충족 시 DB 접근 없음, DB 실패, CAS 충돌, stale ticker 제외, 발송 실패, 429 처리와 비밀값 제거를 검증합니다.

`node backend/test/discord-live.cjs --send`: **실제 Discord 가격 알림 1건을 보냅니다.** KRW-BTC ABOVE 1원 임시 1회 알림으로 실제 ticker→DB→Discord SENT와 중복 방지를 확인한 뒤 임시 알림을 삭제합니다. 이력은 남습니다. 기존 사용자 알림은 수정하지 않습니다.

공식 문서: [Execute Webhook](https://docs.discord.com/developers/resources/webhook#execute-webhook), [Rate Limits](https://docs.discord.com/developers/topics/rate-limits).

## 실측 결과 (2026-09-27)

백엔드 단위 테스트 47개, Playwright 브라우저 테스트 2개 통과. Docker Backend/PostgreSQL healthy 확인. 연결 확인 메시지 1건과 실제 WebSocket 가격으로 발생한 임시 1회 알림 1건의 Discord 서버 발송 확인 완료. 임시 알림의 비활성화와 단일 이력 생성을 확인한 뒤 임시 알림을 삭제했습니다. 이력은 보존했습니다. 휴대폰 푸시 수신 여부는 별도 확인이 필요합니다.
