// Apple Vision 프레임워크 OCR — JXA (osascript -l JavaScript)
// 사용: osascript -l JavaScript macVisionOcr.jxa.js <이미지경로>
// 출력(stdout): JSON { ok, text } 또는 { ok:false, error }
// macOS 내장 기능만 사용 — 컴파일/외부 의존성 없음. 한국어는 macOS 13+ 지원.
ObjC.import('Foundation');
ObjC.import('Vision');

function run(argv) {
  try {
    const path = argv[0];
    if (!path) return JSON.stringify({ ok: false, error: 'no-path' });

    const url = $.NSURL.fileURLWithPath(path);

    const request = $.VNRecognizeTextRequest.alloc.init;
    request.recognitionLevel = $.VNRequestTextRecognitionLevelAccurate;
    request.usesLanguageCorrection = true;
    request.recognitionLanguages = $(['ko-KR', 'en-US', 'ja-JP', 'zh-Hans']);

    // 주의: options 에 null/$() 를 넘기면 NSNull 로 변환돼 예외 발생 — 빈 NSDictionary 필수
    const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $.NSDictionary.dictionary);
    const errRef = Ref();
    const ok = handler.performRequestsError($([request]), errRef);
    if (!ok) return JSON.stringify({ ok: false, error: 'vision-failed' });

    const results = request.results;
    const lines = [];
    for (let i = 0; i < results.count; i++) {
      const cand = results.objectAtIndex(i).topCandidates(1);
      if (cand.count > 0) lines.push(ObjC.unwrap(cand.objectAtIndex(0).string));
    }
    return JSON.stringify({ ok: true, text: lines.join('\n') });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e) });
  }
}
