import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

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
  await run('ffmpeg', ['-y', '-i', audioPath, '-ar', '16000', '-ac', '1', wav]);
  await run(bin, ['-m', model, '-f', wav, '-l', 'en', '-otxt', '-of', wav], { timeout: 180_000 });
  return (await readFile(`${wav}.txt`, 'utf8')).trim();
}
