export function getListenConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
  };
}
