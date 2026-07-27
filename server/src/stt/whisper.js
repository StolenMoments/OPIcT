import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink } from 'node:fs/promises';

const run = promisify(execFile);

export async function transcribe(audioPath) {
  if (process.env.OPICT_STT_STUB) {
    const { stdout } = await run(process.execPath, [process.env.OPICT_STT_STUB, audioPath]);
    return stdout.trim();
  }
  const bin = process.env.OPICT_WHISPER_BIN;
  const model = process.env.OPICT_WHISPER_MODEL;
  if (!bin || !model) throw new Error('OPICT_WHISPER_BIN / OPICT_WHISPER_MODEL 환경변수가 필요합니다');

  const wav = `${audioPath}.wav`;
  const txt = `${wav}.txt`;
  try {
    // 타임아웃 필수 — 이 함수는 서버 전역 직렬 큐 안에서 돌기 때문에,
    // ffmpeg이 멈추면 이후 모든 교정·평가 요청이 함께 멈춘다.
    await run('ffmpeg', ['-y', '-i', audioPath, '-ar', '16000', '-ac', '1', wav], { timeout: 180_000 });
    await run(bin, ['-m', model, '-f', wav, '-l', 'en', '-otxt', '-of', wav], { timeout: 180_000 });
    return (await readFile(txt, 'utf8')).trim();
  } finally {
    // 중간 산출물(wav·txt)은 성공·실패 여부와 무관하게 정리한다.
    // 정리 실패가 원래 에러를 가리지 않도록 여기서 삼킨다.
    await unlink(wav).catch(() => {});
    await unlink(txt).catch(() => {});
  }
}
