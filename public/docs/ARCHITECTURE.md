# PKL 아키텍처 & 플로우 다이어그램

> 시각 자료 모음. GitHub·VS Code 등 **Mermaid를 렌더하는 뷰어**에서 다이어그램이 그림으로 보입니다.
> 버전 1.0.0 · 2026-06-07

---

## 1. 전체 구조 — 하나의 코드, 4개 플랫폼

```mermaid
flowchart TB
  subgraph CORE["공통 코어 (React + Vite)"]
    UI["화면: 서재·뷰어·검색·지식·목표·AI"]
    LOGIC["로직: PDF캐시 · OCR · AI · 로컬책"]
  end

  CORE --> WEB["🌐 웹 / PWA<br/>Vercel"]
  CORE --> ELE["🖥 데스크톱<br/>Electron (DMG)"]
  CORE --> AND["📱 Android 태블릿<br/>Capacitor (APK)"]
  CORE --> IOS["🍎 iPad<br/>Capacitor / PWA"]

  WEB -. HTTPS+CSP .-> NET
  ELE -. 네이티브 파일·메뉴 .-> OSFS["OS 파일시스템"]
  AND -. 네이티브 파일 .-> OSFS

  NET["외부 (선택)<br/>AI API · Google Drive"]
```

**핵심 원칙**: 같은 React 코드를 4개 플랫폼이 공유. 플랫폼 차이(`isElectron`/`isCapacitor`)는 런타임 분기로 흡수.

---

## 2. 사용자 여정 (온보딩 → 읽기 → 지식)

```mermaid
flowchart LR
  S["앱 실행"] --> O{"플랫폼?"}
  O -->|"웹"| G["Google 연결<br/>(선택)"]
  O -->|"데스크톱·태블릿"| L["로컬 PDF로<br/>바로 시작"]
  G --> K["AI 키 입력<br/>(선택)"]
  L --> K
  K --> LIB["📚 서재"]
  LIB -->|"책 추가"| ADD["PDF 가져오기"]
  ADD --> VIEW["📖 뷰어"]
  LIB -->|"책 선택"| VIEW
  VIEW --> HL["형광펜·메모·북마크"]
  VIEW --> AI["🤖 AI 분석"]
  VIEW --> OCR["🔤 스캔본 OCR"]
  HL --> KNOW["📝 지식"]
  AI --> KNOW
  KNOW --> EXP["📤 내보내기/공유"]
```

---

## 3. 책 로딩 — 캐시 우선 (로컬 & Drive 공통)

```mermaid
flowchart TD
  OPEN["책 열기"] --> CACHE{"IndexedDB<br/>캐시에 있나?"}
  CACHE -->|"있음 ⚡"| RENDER["pdf.js 렌더"]
  CACHE -->|"없음"| SRC{"출처?"}
  SRC -->|"로컬(local)"| FP{"filePath<br/>있나?(Electron)"}
  FP -->|"있음"| RELOAD["네이티브 재읽기"] --> SAVE["캐시 저장"]
  FP -->|"없음"| MISS["재추가 안내"]
  SRC -->|"Drive"| DL["Drive 다운로드<br/>(진행률)"] --> SAVE
  SAVE --> RENDER
```

> 한 번 연 책은 IndexedDB에 캐시 → 다음부터 네트워크 없이 즉시.

---

## 4. AI 분석 — 책 텍스트 보장 파이프라인

```mermaid
flowchart TD
  Q["사용자 질문"] --> HAS{"책 텍스트<br/>캐시에 있나?"}
  HAS -->|"있음"| BUILD
  HAS -->|"없음"| ENSURE["ensureBookText:<br/>캐시 PDF→pdf.js 추출"]
  ENSURE --> OCRQ{"텍스트<br/>나왔나?"}
  OCRQ -->|"예"| BUILD
  OCRQ -->|"아니오(스캔본)"| OCR["OCR 실행"]
  OCR --> BUILD["시스템 프롬프트<br/>= 메타 + 책내용 + 메모"]
  BUILD --> SEND["AI 호출<br/>(Claude/Gemini)"]
  SEND --> ANS["책 기반 답변"]
```

> 뷰어를 안 거쳐도, 앱을 재시작해도 **AI가 항상 책 내용 기반**으로 답하도록 보장.

---

## 5. OCR provider 체인 (로컬 우선)

```mermaid
flowchart LR
  IMG["스캔 페이지<br/>이미지"] --> M{"OCR 모드"}
  M -->|"local / auto"| OLL{"Ollama<br/>(데스크톱)?"}
  OLL -->|"가용"| G1["Gemma 4<br/>Ollama"]
  OLL -->|"없음"| MP{"WebGPU+<br/>모델URL?"}
  MP -->|"있음"| G2["Gemma 4<br/>MediaPipe"]
  MP -->|"없음"| TES["Tesseract<br/>(항상 가능)"]
  M -->|"cloud / auto폴백"| CV["Cloud Vision"]
  CV --> AV["AI Vision<br/>(Claude/Gemini)"]
  G1 & G2 & TES & CV & AV --> TXT["추출 텍스트"]
```

| 우선 | 엔진 | 플랫폼 | 품질 | 위치 |
|:--:|------|--------|:--:|------|
| 1 | Gemma 4 (Ollama) | 데스크톱 | ★★★★★ | 로컬 |
| 2 | Gemma 4 (MediaPipe/WebGPU) | 웹·태블릿 | ★★★★★ | 로컬 |
| 3 | Tesseract.js | 전부 | ★★★★ | 로컬 |
| 4 | Cloud Vision / AI Vision | 전부 | ★★★★★ | 클라우드 |

---

## 6. 데이터 저장 위치 (프라이버시)

```mermaid
flowchart TB
  subgraph DEVICE["내 기기 (서버 전송 없음)"]
    LS["localStorage<br/>설정·메모·진도·AI키"]
    IDB["IndexedDB<br/>PDF 캐시"]
    MEM["메모리<br/>추출 텍스트"]
  end
  subgraph CLOUD["외부 (선택·옵트인)"]
    AIAPI["AI API<br/>(질문 시 책 일부)"]
    DRIVE["Google Drive<br/>(연동 시)"]
  end
  DEVICE -. "클라우드 OCR/AI 사용 시에만" .-> CLOUD
```

> 기본은 **전부 기기 내부**. 클라우드는 사용자가 선택한 기능에서만 작동.

---

## 7. 보안 계층

```mermaid
flowchart TB
  subgraph WEBSEC["웹"]
    H1["HSTS · CSP · X-Frame DENY<br/>nosniff · Referrer/Permissions-Policy"]
  end
  subgraph ELESEC["데스크톱(Electron)"]
    H2["CSP 헤더 주입<br/>contextIsolation · readPdf 경로검증<br/>openExternal 스킴검증 · navigation 차단"]
  end
  subgraph COMMON["공통"]
    H3["BYOK(키 기기보관) · esc()XSS방어<br/>npm audit 0건"]
  end
```

---

## 8. 빌드·배포 파이프라인

```mermaid
flowchart LR
  SRC["src/ (React)"] --> VITE["vite build → dist/"]
  VITE --> WEB["vercel --prod<br/>🌐 웹"]
  VITE --> CAPS["cap sync"]
  CAPS --> APK["gradlew assembleRelease<br/>📱 APK(서명)"]
  CAPS --> XC["Xcode<br/>🍎 iOS"]
  VITE --> EB["electron-builder<br/>🖥 DMG (arm64/x64)"]
```

| 명령 | 산출물 |
|------|--------|
| `npm run build` + `vercel --prod` | 웹 |
| `npm run electron:build` | macOS DMG |
| `npm run cap:apk:release` | 서명된 Android APK |
| `npm run cap:ios` | Xcode 프로젝트 |
