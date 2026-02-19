import { execa } from 'execa';

function getToolTimeoutMs(): number {
  const timeoutMs = Number.parseInt(process.env.FANGIO_TOOL_TIMEOUT_MS || '15000', 10);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000;
}

function getToolMaxBufferBytes(): number {
  const maxBufferBytes = Number.parseInt(process.env.FANGIO_TOOL_MAX_BUFFER_BYTES || '1048576', 10);
  return Number.isFinite(maxBufferBytes) && maxBufferBytes > 0 ? maxBufferBytes : 1048576;
}

export async function runCommand(command: string, args: string[]) {
  return execa(command, args, {
    timeout: getToolTimeoutMs(),
    maxBuffer: getToolMaxBufferBytes(),
  });
}
