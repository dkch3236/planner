# FlowWeek

“계획은 시스템이 제안하고, 실제 행동은 사용자가 결정하며, 시스템은 그 결과를 받아 미래를 다시 계산한다.”

Vanilla HTML/CSS/JavaScript ES Modules로 만든 개인 일정·루틴·할 일 자동 배치 앱입니다. 런타임 프레임워크, 빌드 과정, 서버 데이터베이스가 필요하지 않습니다. 첫 실행에 예시 할 일 2개와 루틴 1개가 생성됩니다.

## 실행

프로젝트 폴더에서 Node.js 20 이상으로 실행합니다.

```sh
node server.mjs
```

브라우저에서 **http://127.0.0.1:4173** 을 엽니다. `index.html`을 더블클릭하는 `file://` 방식은 ES Module 보안 정책 때문에 지원하지 않습니다. 서버는 이 컴퓨터의 루프백 주소에만 바인딩됩니다. 종료는 실행 중인 터미널에서 Ctrl+C입니다.

```sh
node --test
```

위 명령은 별도 패키지 설치 없이 도메인·스케줄러 회귀 테스트를 실행합니다. `npm start`, `npm test`도 같은 명령입니다. Prettier는 소스 정리용 개발 의존성으로, 앱 실행에는 필요하지 않습니다.

```sh
npm install
npm run format
```

## 전체 소스 구조와 각 파일의 역할

```text
Planner/
├─ index.html                   # 앱·모달·알림 root, 외부 CSS와 ES Module 로딩
├─ package.json                 # 실행·테스트·포맷 명령과 개발 의존성
├─ pnpm-lock.yaml               # 개발 의존성 잠금 파일
├─ server.mjs                   # 로컬 정적 파일 HTTP 서버
├─ README.md                    # 실행·설계·검증·인수인계 문서
├─ .gitignore                   # 설치 패키지·캐시 제외
├─ .prettierrc.json             # 소스 포맷 규칙
├─ css/
│  ├─ base.css                  # 색상·타이포그래피·공통 요소
│  ├─ layout.css                # 페이지·탭·반응형 레이아웃
│  └─ components.css            # 현재 카드·주간 블록·모달·폼
├─ js/
│  ├─ app.js                    # 이벤트 위임, 액션 연결, 실제 집중 시간 측정
│  ├─ state/
│  │  ├─ schema.js              # 버전 있는 초기 상태, 예시 데이터
│  │  ├─ persistence.js         # 유일한 localStorage 접근 지점
│  │  └─ store.js               # 트랜잭션 저장·구독·시계·재진입 처리
│  ├─ domain/
│  │  ├─ todo.js                # leaf·parent chain·진행상황 집계
│  │  ├─ routine.js             # anchor window·횟수·요일·수행 기회
│  │  ├─ occurrences.js         # 고정일정·수면 occurrence, 반복 수정 범위
│  │  ├─ execution.js           # 단일 실행·완료·성과·실제 기록 생성
│  │  └─ actions.js             # 입력 검증 및 명시적 사용자 상태 전이
│  ├─ scheduler/
│  │  ├─ availability.js        # 가용 구간·예약시간·시간 제약
│  │  ├─ planner.js             # 압력·밀도·배정·회복·여백 계산
│  │  ├─ replan.js              # 확인 대기·재계획·후보·수동 재배치
│  │  └─ currentView.js         # 현재 시각에 보여줄 상태만 판단
│  ├─ ui/
│  │  ├─ render.js              # 앱 shell·가상시계·내비게이션
│  │  ├─ views.js               # 오늘·관리·주간·계획 조정 화면
│  │  ├─ forms.js               # 입력 폼·조건부 필드·폼 값 변환
│  │  └─ modals.js              # 상세·생성·완료·전환·확인 모달
│  └─ utils/
│     └─ date.js                # appNow·날짜·시간·ID·구간 유틸리티
└─ tests/
   └─ flowweek.test.js          # 시나리오 기반 자동 회귀 테스트
```

`node_modules/`, `.cache/`는 로컬 개발 도구 설치 시 생기는 생성물이며 소스가 아닙니다. 모든 실제 앱 코드가 위 파일들에 들어 있습니다. 빈 함수나 외부 서비스 연동을 기다리는 자리표시자는 없습니다.

## 데이터 모델

| 영역        | 저장 값                                               | 의미                                        |
| ----------- | ----------------------------------------------------- | ------------------------------------------- |
| 요구량      | `todos`, `routines`                                   | 실제로 남은 일, 반복 수행 기준              |
| 보호 일정   | `fixedSeries`, `fixedOccurrences`, `sleepOccurrences` | 반복 원본과 날짜별 인스턴스                 |
| 수면 원본   | `settings.sleepTemplate`                              | 취침·기상 템플릿                            |
| 현재 실행   | `execution` 또는 `null`                               | 사용자가 명시적으로 시작한 단일 활동        |
| 성과        | `sessions`                                            | 확인 집중 시간, 반영 작업량, 루틴 충족 여부 |
| 실제 생활   | `timeline`                                            | 사용자가 확인한 실제 시작·종료 구간         |
| 제안        | `livePlan`                                            | 현재 상태에서 계산한 미래 예약              |
| 미확인      | `unconfirmed`, `resolvedPlanIds`                      | 시간이 지난 계획과 처리한 계획 식별자       |
| 사용자 약속 | `personalPlans`                                       | 사용자가 예약한 보상활동                    |
| 자유시간    | `freeCreditToday`, `pendingSaved`                     | 당겨서 모은 시간과 조기완료 선택 대기       |
| 설정/표시   | `settings`, `ui`, `diagnostics`                       | 밀도·집중시간·탭·가상시계·미배정 안내       |

Todo의 `parentId`는 재귀 트리 관계입니다. 부모의 남은 양은 활성 leaf 기준으로 집계합니다. 관리 화면 깊이는 항상 parent chain으로 계산합니다. Global +에는 부모 선택을 넣지 않고 Todo 상세의 “하위 할 일 추가”로 연결합니다.

PlanBlock은 `sourceId`, `sourceType`, `assignedWorkMin`, `reservedMin`, `plannedStart`, `plannedEnd`, `focusLike`, `locked`를 가집니다. 날짜만 배정된 블록은 `date`를 가지고 `plannedStart/End`는 `null`입니다.

SessionRecord의 `wallClockElapsed`, `measuredFocusMin`, `confirmedFocusMin`, `appliedWorkMin`은 서로 다른 값입니다. TimelineRecord 수정은 SessionRecord와 요구량을 수정하지 않습니다.

## 주요 상태 흐름

```text
Demand → planner → LivePlan → resolveCurrentView → 화면
                       ↑                             │
                       │                      사용자 명시적 행동
                       │                             ↓
                  replanFuture ← 요구량 갱신 ← Execution 종료
                                                ├─ SessionRecord
                                                └─ TimelineRecord (확인한 구간만)
```

`applyAction(state, action, now)`는 원본을 복사한 상태에서 검증·전이를 수행합니다. 실패하면 원본 상태를 보존합니다. Store는 성공 결과를 저장한 뒤 구독자에 통지합니다. 렌더링 함수는 상태를 읽기만 합니다.

| 행동                          | 결과                                                                        |
| ----------------------------- | --------------------------------------------------------------------------- |
| 지금 시작하기                 | Execution 생성. 시작하지 않은 계획은 실행으로 취급하지 않음                 |
| 이 블록 작업 완료             | 해당 블록의 할당 작업량을 차감. 다음 실행은 자동 생성하지 않음              |
| 미완료로 끝내기               | 확인한 집중 시간만 차감. 예상량을 소진해도 미완료면 추가 남은 양 요구       |
| 다른 작업 먼저 하기           | 앞 작업을 실패 처리하지 않고 선택 작업 시작, 영향을 받은 미래 재배치        |
| 다른 작업으로 전환            | 현재 작업 집중 시간 확인 → incomplete session → 선택 작업 실행; 한 트랜잭션 |
| 확인할 기록: 했어요           | 실제 시각을 수정·확인한 뒤 성과/생활 기록 생성                              |
| 확인할 기록: 못 했어요        | 확인 항목 제거. Todo 요구량을 성공 차감하지 않음                            |
| 확인할 기록: 아직 하고 있어요 | 확인한 시작 시각으로 Execution 연결                                         |
| 자러가기 / 일어났어요         | occurrence의 SLEEPING / CLOSED 명시적 전이                                  |
| 생활 기록 수정                | 생활 구간만 변경. 성과·남은 작업량 보존                                     |

수면의 CLOSED 인스턴스는 같은 날짜 템플릿으로 재생성하지 않습니다. 그 날짜에 사용자가 **다시** 자러가기를 누르면 별도 추가 수면 인스턴스를 생성합니다. 시간 경과에 따른 재오픈은 없습니다.

## 스케줄링과 수동 조정

1. 고정일정·수면·보상 예약·현재 실행을 확보합니다.
2. 7일의 고정시각 Todo/Routine을 우선 배치합니다.
3. 기존 미래 블록 중 여전히 유효한 것은 ID와 시각을 유지합니다. 수정된 요구량, 충돌, 제약 변경 때문에 필요한 블록만 줄이거나 재배치합니다.
4. MUST/SHOULD/OPTIONAL, 선호도, 남은 양/마감까지 시간으로 Todo 압력을 계산합니다. Routine은 남은 횟수/남은 수행 기회를 반영합니다.
5. 실제 가용시간에 55/65/75% 밀도를 적용합니다. 당일 마감 MUST는 필요 시 초과할 수 있습니다.
6. 오늘~+2일은 시각을 배정합니다. +3~+6일 flexible 작업은 날짜만 표시하며, 내부 임시 구간으로 시간 범위 수용량을 확인합니다.
7. 일반 집중 배치 사이에는 최소 15분 회복 여유를 둡니다. 이미 잠근 일정끼리의 충돌은 자동 이동 대신 진단에 표시합니다.
8. 가까운 날은 실제 FREE 구간을 표시하고, 먼 날은 예약량을 뺀 날짜별 예상 자유시간을 표시합니다.

밀도와 FREE 잔여량은 자유시간 보호 규칙입니다. 계획은 최적해를 증명하는 수학적 최적화가 아닌 제약을 검사하는 휴리스틱입니다. 배치하지 못한 양을 숨기지 않고 “계획 조정”에서 보여줍니다. 충돌한 고정·잠금 일정은 사용자가 직접 조정해야 합니다.

일반 행동은 최소 변경 재계획을 사용합니다. 사용자가 밀도·수면 설정을 바꾸거나 “미래 계획 다시 제안”을 누른 경우에만 flexible 미래 전체를 새로 제안합니다. Timeline을 다시 쓰는 일은 없습니다.

`manualReschedule`의 네 모드:

- `PULL_FROM_FREE`: 모든 ACTIVE leaf/Routine에서 지금 합법적인 후보를 제시합니다. 고정·잠금·요일/시간 범위 위반·충족한 루틴은 제외합니다.
- `REORDER_PLANNED`: A/B 단순 swap 없이 선택 작업을 삽입합니다. A 요구량은 유지합니다.
- `SWITCH_EXECUTION`: A의 종료와 B의 시작을 하나의 액션에서 검증합니다. B가 불가능하면 A 종료도 커밋하지 않습니다.
- `PULL_FREE_FOR_REWARD`: 현재 이후 오늘의 FREE, 고정·수면·잠금·긴급 MUST 보호, 각 루틴 주기 안의 수행량과 다른 작업량의 보존을 검사한 뒤 재배치합니다.

Free Credit은 블록을 완료하고 원래 종료 시각 전에 “다음 작업 당겨오기”를 선택했을 때만 늘어납니다. 미완료 종료와 과거 기록 확인은 적립을 제안하지 않습니다. 적립량은 남은 조기완료 구간과 새로 시작하는 작업량 이내입니다. 바로 쉬면 늘어나지 않습니다. 기본 자유시간은 Credit과 무관하게 보상활동에 사용할 수 있습니다. 보상 모달에서 오늘의 나중 FREE 시간도 제안합니다.

## 시간과 재진입

계획 판단에는 모두 `appNow(state)`를 사용합니다. 상단 가상시계의 날짜/시각 적용, ±15분, ±1시간, 블록 끝 −5분/+10분, 실제시간 복원을 지원합니다.

집중 타이머는 계획용 가상시계와 별도로 실제 시간을 측정합니다. 할 일과 루틴만 측정하며 사용자가 일시정지·재개할 수 있습니다. 입력이 없는 독서나 일반적인 백그라운드 전환도 실행 중이면 포함합니다. 브라우저 재접속 또는 60초 넘는 측정 공백은 일시정지하며 마지막 측정값을 보존합니다. 종료 확인값은 사용자가 수정할 수 있습니다.

일반 tick은 현재 화면·측정값만 갱신합니다. 앱 로드, 탭 재진입, 주간 열기, 명시적 행동/가상시계 조작에서는 지난 계획을 확인 대기로 분리합니다. 앱 재진입과 주간 열기는 미래 제약을 재검사합니다.

가상시계를 과거로 돌려도 이미 기록한 실제 행동은 삭제되지 않습니다. 테스트 중 만든 기록이 실제시간보다 미래에 있으면 시계를 되돌려 그 기록을 다시 작성하는 대신 테스트 데이터라는 점을 고려해야 합니다.

## 필수 불변식

- `activeExecution <= 1`
- `past Plan never becomes History automatically`
- `History never changes because of replanning`
- `Replan changes future only`
- `Todo progress is based on completed work, not elapsed block time`
- `assignedWorkMin != reservedMin`
- `CurrentView != Execution`
- `SessionRecord != TimelineHistory`
- `Sleep/Fixed repetition uses Occurrences`
- `FreeCredit quantity != FreeBlock location`
- `Time passing updates CurrentView, user actions update Reality`
- `Today and Week use the same LivePlan`
- `Completed Todo does not remain in default active management list`

Routine의 N/M window는 anchorDate에서 달력 날짜 단위로 계산합니다. 같은 날 완료 기록이 여러 개라도 횟수는 1회입니다. 이전 주기의 부족분은 다음 주기에 이월하지 않습니다. 불가능한 요일/명시적 수행불가 날짜는 UNAVAILABLE입니다. 미확인 계획이 있다는 이유로 자동 MISSED 처리하지 않습니다.

## 테스트 시나리오

자동 테스트는 고정 날짜 fixture와 순수 상태 전이를 사용하며 브라우저 데이터에 접근하지 않습니다.

| 시나리오                         | 확인 사항                                             |
| -------------------------------- | ----------------------------------------------------- |
| 90분 Todo                        | 45분 작업 / 60분 예약 두 세션, 집중 간격              |
| 45분 할당을 40분에 완료          | 남은 양 45분 차감, 자동 다음 실행 없음                |
| 미완료 종료                      | 집중 시간만 차감, 부족한 추가 예상량 요구             |
| 90분 벽시계 / 집중 시간 30분     | 확인한 30분만 성과, 기록하지 않은 구간 보존           |
| 자식 Todo 완료                   | 부모 집계, 기본 활성 목록에서 제거, parent chain 깊이 |
| N/M 반복                         | 고정 window, 하루 중복 횟수 방지, 부족분 미이월       |
| 특정 요일                        | 다른 요일에 배치하지 않음, 수행불가 구분              |
| Fixed                            | 시작/완료/못함, 이번만/앞으로 범위, 실제 시각         |
| Sleep                            | 명시적 시작/기상, CLOSED 재생성 방지                  |
| 확인 대기                        | 자동 성공·실패·History 생성 없음, 처리 즉시 항목 제거 |
| 당겨오기 / 순서 변경 / 실행 전환 | 후보 제약, 원래 작업량 유지, 단일 Execution           |
| 조기완료 자유시간                | 당기면 Credit 증가, 쉬면 증가 없음                    |
| 보상                             | Credit 0이어도 가능, 나중 예약, 재배치, 보호 제약     |
| Timeline 편집                    | 성과와 작업량 불변                                    |
| 주간                             | rolling 7일, 먼 flexible 날짜만 배정, 여백 수용량     |
| 새 고정시각 루틴                 | 기존 flexible을 밀고 정확한 시각 확보                 |

수동 브라우저 smoke test:

1. - → 할 일 → 10분 Todo를 생성하고 관리에 즉시 나타나는지 확인합니다.
2. 오늘 → 다른 작업 먼저 하기 → 새 Todo를 선택합니다. 실행 중 버튼만 보이는지 확인합니다.
3. 가상시계 +15분 → 이 블록 작업 완료 → 집중 시간 10분 확인 후 저장합니다. 진행 중에서 사라지고 완료한 할 일로 이동하는지 확인합니다.
4. Routine을 시작하고 최소 버전 이상의 집중 시간을 확인합니다. 오늘 완료와 주기 횟수를 확인합니다.
5. 일정을 만들고 시작·끝내기 또는 예정 종료 후 못 했어요로 처리합니다.
6. 수면시간으로 시계를 옮겨도 자동 실행되지 않는지 확인하고, 자러가기/일어났어요 후 CLOSED 상태를 확인합니다.
7. 예정 종료 +10분 → 주간 → 확인할 기록을 열어 했어요/못 했어요 처리 즉시 항목이 사라지는지 확인합니다.
8. 실행 중 다른 작업으로 전환하며 미완료 집중 시간을 확인합니다. 이전 작업의 남은 양이 감소하고 새 실행이 한 개만 생성되는지 확인합니다.
9. 보상활동 60분을 지금 재배치하거나 나중 FREE에 예약합니다. 고정·잠금 충돌 시 안내하고 원본이 보존되는지 확인합니다.
10. 주간의 미기록 구간을 눌러 휴식/수면/직접 입력을 남기고 다시 수정합니다. Todo 성과가 바뀌지 않는지 확인합니다.

## 인수인계: 새로운 기능을 추가하려면 어디를 수정해야 하는가?

| 변경                    | 수정 지점과 순서                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| 새로운 Todo 속성        | `domain/todo.js` → `state/schema.js` → `ui/forms.js` → 필요하면 `planner.js` scoring       |
| 새로운 Scheduling rule  | `scheduler/availability.js`, `planner.js`, `replan.js` → 회귀 테스트. UI에서 계산하지 않기 |
| 새로운 CurrentView 상태 | `scheduler/currentView.js` → `ui/views.js` current renderer → 액션 연결                    |
| 새로운 관리 화면        | `ui/views.js` manage → `render.js` 내비게이션 → 필요한 폼/액션                             |
| 새로운 Execution 종류   | `domain/execution.js` → `domain/actions.js` 종료 규칙 → Session/Timeline 정책              |
| 새로운 반복 규칙        | `domain/routine.js` window/opportunities → `occurrences.js` 필요 시 → scheduler allocation |
| 새로운 화면/버튼        | UI module의 `data-action` → `app.js` 또는 `modals.js` dispatch → domain action             |
| 저장 형식 변경          | `schema.js` 버전 증가 → `persistence.js` 명시적 migration → 이전 데이터 fixture 검증       |
| IndexedDB/서버 동기화   | `persistence.js` 교체, store 커밋을 비동기화. Scheduler에 저장 접근 추가 금지              |

도메인 액션은 입력 검증 전에 원본 상태를 수정하지 않아야 합니다. 새 전환은 실패 시 원본 보존, 단일 실행, 과거 기록 보존 테스트를 함께 추가합니다. import/export와 `data-action` 양끝이 연결되었는지도 확인합니다.

## 저장 범위와 현재 설계 한계

- 데이터는 현재 브라우저 origin의 localStorage에 있습니다. 다른 브라우저/기기와 자동 동기화되지 않습니다. “계획 조정 → 데이터 내보내기”로 백업할 수 있습니다.
- schema version 2를 사용하며 version 1을 명시적으로 이전합니다. 기록과 기존 적립량은 보존하고 이전 버전의 적립 대기 제안만 해제합니다. 이전 타이머는 일시정지하여 재개 시점을 사용자가 선택하게 합니다. 손상 JSON이나 알 수 없는 버전은 초기화하지 않고 오류를 표시하며 원본을 보존합니다.
- 현재 표시는 브라우저 로컬 시간대 기준입니다. 서로 다른 시간대를 오가는 캘린더 동기화와 DST 정책은 별도 확장 영역입니다.
- 완료/취소한 occurrence와 session은 감사 가능한 기록으로 유지합니다. 장기 사용 시 IndexedDB 전환·보관 정책을 추가할 수 있습니다.
- 작업 배정은 유한한 rolling 7일 범위입니다. 그 밖의 마감 요구량은 배치되지 않은 양으로 안내할 수 있습니다. 자동으로 마감을 연장하거나 일을 완료 처리하지 않습니다.
- 폰트는 Google Fonts를 선택적으로 읽으며 네트워크가 없으면 시스템 sans-serif로 표시합니다. 그 외 앱 기능은 외부 API에 의존하지 않습니다.

## 이틀 시나리오 수정 검증

53개 자동 검사를 통과했습니다. 과거 기록과 실행 분리, 적립 유효 구간, 과거 자유시간 차단, 루틴 재배치, 지연 수행, 고정 일정 전환, 타이머와 데이터 이전을 검사합니다. 변경 내역과 별도 브라우저 재검증 결과는 `reports/fixes/REPORT.md`에 있습니다. `reports/two-day`는 수정 전 관찰 기록으로 보존합니다.
