#!/usr/bin/env node
/* 개발용 Electron 런처.
   VS Code 통합 터미널 등은 ELECTRON_RUN_AS_NODE=1 을 주입하는데,
   이 값이 있으면 Electron 이 순수 Node 로 떠서 main process API(app 등)가
   undefined 가 된다. 여기서 해당 변수를 제거하고 electron 을 spawn 한다. */
const { spawn } = require('child_process');
const electronPath = require('electron'); // 바이너리 절대경로 (npm 패키지)

const env = { ...process.env, ELECTRON_DEV: '1' };
delete env.ELECTRON_RUN_AS_NODE; // 핵심: main process 모드로 실행

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
child.on('close', (code) => process.exit(code ?? 0));
